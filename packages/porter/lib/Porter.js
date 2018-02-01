'use strict'

const atImport = require('postcss-import')
const autoprefixer = require('autoprefixer')
const babel = require('babel-core')
const crypto = require('crypto')
const debug = require('debug')('porter')
const path = require('path')
const postcss = require('postcss')
const mime = require('mime')
const minimatch = require('minimatch')
const UglifyJS = require('uglify-js')
const { exists, lstat, readFile, realpath, writeFile } = require('mz/fs')
const { SourceMapConsumer, SourceMapGenerator } = require('source-map')
const { spawn: _spawn } = require('child_process')

const Cache = require('./Cache')
const deheredoc = require('./deheredoc')
const glob = require('./glob')
const matchRequire = require('./matchRequire')
const mkdirp = require('./mkdirp')

const rExt = /\.(?:css|gif|jpg|jpeg|js|png|svg|swf|ico)$/i
const rModuleId = /^((?:@[^\/]+\/)?[^\/]+)(?:\/(\d+\.\d+\.\d+[^\/]*))?(?:\/(.*))?$/
const rURI = /^(?:https?:)?\/\//

const inProduction = process.env.NODE_ENV === 'production'

function spawn(command, args, opts) {
  return new Promise(function(resolve, reject) {
    const proc = _spawn(command, args, opts)

    proc.on('exit', function(code) {
      if (code === 0) resolve()
      else reject(new Error(code))
    })
  })
}

async function findAsset(id, dirs, extensions = ['']) {
  if (id.endsWith('/')) extensions = [`index${extensions[0]}`]
  if (typeof dirs == 'string') dirs = [dirs]

  for (const dir of dirs) {
    for (const ext of extensions) {
      const fpath = path.join(dir, `${id}${ext}`)
      if (await exists(fpath) && (await lstat(fpath)).isFile()) {
        return [fpath, ext]
      }
    }
  }

  return [null]
}

function findScript(id, dirs, extensions = ['.js', '/index.js', '']) {
  return findAsset(id, dirs, extensions)
}

function findStyle(id, dirs, extensions = ['', '.css', '/index.css']) {
  return findAsset(id, dirs, extensions)
}

async function closestModule(dir, name) {
  const fpath = path.join(dir, 'node_modules', name)

  if (await exists(fpath)) {
    return fpath
  } else if (dir.includes('/node_modules/')) {
    while (path.basename(dir) !== 'node_modules') {
      dir = path.resolve(dir, '..')
    }
    return await closestModule(path.resolve(dir, '..'), name)
  } else {
    throw new Error(`Unable to find module '${name}' by traversing ${dir}`)
  }
}

/**
 * Copy map data referenced in route from dependencies tree to tree branch,
 * which will later be used as a slimmer version of dependencies tree.
 *
 * @param {Object} treeBranch      A slimmer version of dependencies tree
 * @param {Object} tree            The dependencies tree of the app
 * @param {Array}  route           The route of the module required
 */
function mergeMap(treeBranch, tree, route) {
  const [appName, depName] = route
  const app = tree[appName]

  if (!treeBranch[appName]) {
    treeBranch[appName] = {
      version: app.version,
      main: app.main,
      dependencies: {}
    }
  }

  treeBranch[appName].dependencies[depName] = JSON.parse(
    JSON.stringify(app.dependencies[depName], (key, value) => {
      if (key !== 'parent') return value
    })
  )
}

/**
 * Find module map by route in the dependencies tree.
 *
 * Notice the route is generated while resolving dependencies. It's quite
 * possible that the module is not at the provided path but at somewhere up in
 * the tree. For example, the path might be ['ez-editor', 'yen']. If the root
 * package.json has `yen` listed as dependencies and the version specified meets
 * the version `ez-editor` uses, then yen will be installed at the upper level.
 *
 * So `yen` can only be found at `<root>/node_modules/yen` rather than
 * `<root>/node_modules/ez-editor/node_modules/yen` in this case.
 *
 * That's the problem this function aims to solve.
 *
 * @param {Array}  route           The route of the dependency
 * @param {Object} tree            The map of the dependencies tree
 * @param {Object} treeBranch      The map of the dependencies that are actually required
 *
 * @returns {Object} An object that contains information about the dependency
 */
function routeMap(route, tree, treeBranch) {
  route = [].concat(route)
  let result = null

  while (!result && route.length >= 2) {
    result = route.reduce(function(obj, p) {
      return obj.dependencies[p]
    }, { dependencies: tree })

    if (!result) {
      // ['app', 'ez-editor', 'yen']
      route.splice(-2, 1)
      // ['app', 'yen']
    }
  }

  // If a slimmer map is requested, merge required info to requiredMap.
  if (result && treeBranch) mergeMap(treeBranch, tree, route)
  return result
}

const dirHasBabelrc = {}

async function findBabelrc(fpath, { root }) {
  let dir = path.dirname(fpath)

  if (!dirHasBabelrc[dir]) {
    while (dir.startsWith(root)) {
      let babelrcPath = path.join(dir, '.babelrc')
      if (await exists(babelrcPath)) {
        dirHasBabelrc[dir] = babelrcPath
        break
      }
      dir = path.dirname(dir)
    }
  }

  return dirHasBabelrc[dir]
}

function transform(code, opts) {
  return babel.transform(code, {
    sourceMaps: true,
    sourceRoot: '/',
    ast: false,
    ...opts
  })
}

/**
 * Write compile js and map files.
 * @param {string} id
 * @param {Object} opts
 * @param {string} opts.js   minified javascript
 * @param {string} opts.map  correspondent source map
 * @param {string} opts.dest The folder to store js and map
 */
async function compileScript(id, { dest, js, map }) {
  const assetPath = path.join(dest, `${id}.js`)

  await mkdirp(path.dirname(assetPath))
  await Promise.all([
    writeFile(assetPath, [js, `//# sourceMappingURL=./${path.basename(id)}.js.map`].join('\n')),
    writeFile(`${assetPath}.map`, map)
  ])

  debug('compiled %s', id)
}

/**
 * Transform AST with compressor.
 * @param {string}  id
 * @param {Object}  ast
 * @param {Object}  opts
 * @param {boolean} opts.mangle
 * @param {Object}  opts.sourceMaps
 * @param {string}  opts.sourceRoot
 * @return {Object} - { js, map }
 */
function minifyScript(id, ast, opts) {
  const { mangle, sourceMaps } = { mangle: true, ...opts }
  // Make sure source root is set. If not, the `sources` in generated source map might be obfuscated because `SourceMapGenerator` tries to get relative source paths from source root constantly.
  const sourceRoot = opts.sourceRoot || '/'
  /* eslint-disable camelcase */
  const compressor = new UglifyJS.Compressor({
    screw_ie8: false,
    dead_code: true,
    global_defs: {
      process: {
        env: {
          BROWSER: true,
          NODE_ENV: process.env.NODE_ENV,
        }
      }
    }
  })

  deheredoc(ast)
  ast.figure_out_scope()

  const compressed = ast.transform(compressor)

  if (mangle) {
    compressed.figure_out_scope()
    compressed.compute_char_frequency()
    compressed.mangle_names()
  }

  const outSourceMap = new UglifyJS.SourceMap({
    file: `${id}.js`,
    root: sourceRoot
  })

  const stream = new UglifyJS.OutputStream({
    ascii_only: true,
    screw_ie8: false,
    source_map: outSourceMap
  })
  /* eslint-enable camelcase */
  compressed.print(stream)

  const js = stream.toString()
  const map = JSON.parse(outSourceMap.toString())
  const generator = new SourceMapGenerator.fromSourceMap(new SourceMapConsumer(map))
  sourceMaps.forEach(function(sourceMap) {
    generator.applySourceMap(new SourceMapConsumer(sourceMap), sourceMap.sources[0], sourceRoot)
  })

  return {
    js,
    map: JSON.stringify(generator.toJSON(), function(k, v) {
      if (k != 'sourcesContent') return v
    })
  }
}

/**
 * Bundle a component or module, with its relative dependencies included by default. And if passed opts.tree, include all the dependencies. When bundling all the dependencies, `bundleScript` gets called recursively. The call stack might be something like:
 *
 *     bundleScript('app/0.0.1/index', {
 *       paths: path.join(root, 'components'),
 *       tree, treeBranch,
 *       toplevel: await parseLoader()
 *     })
 *
 *     // found out that the dependencies of main are ['ez-editor', './lib/foo']
 *     // `./lib/foo` can be appended directly but `ez-editor` needs `bundleScript`
 *     bundleScript('ez-editor/0.2.4/index', {
 *       paths: path.join(root, 'node_modules'),
 *       tree, treeBranch,
 *       toplevel,   // current toplevel ast,
 *       moduleIds: { 'app/0.0.1/index': true },
 *       moduleRoute: ['app', 'ez-editor']
 *     })
 *
 *     // found out that the dependencies of ez-editor are ['yen'] and so on.
 *     bundleScript('yen/1.2.4/index', {
 *       root: path.join(root, 'node_modules/ez-editor'),
 *       paths: path.join(root, 'node_modules/ez-editor/node_modules'),
 *       tree, treeBranch,
 *       toplevel,
 *       moduleIds: { 'app/0.0.1/index': true, 'ez-editor/0.2.4/index': true },
 *       moduleRoute: ['app', 'ez-editor', 'yen']
 *     })
 *
 * @param {string}   main
 * @param {Object}   opts
 * @param {string}   opts.paths                 The components load paths
 * @param {string}   opts.root                  The system root
 * @param {Object}  [opts.tree=null]            Pass the dependencies tree if need to bundle modules too.
 * @param {Array}   [opts.moduleIds=[]]         The ids of the modules that are bundled already.
 * @param {boolean} [opts.includesComponents=false] If true, components will be bundled.
 * @param {boolean} [opts.includeModules=false] If true, all dependencies will be bundled.
 * @param {Object}  [opts.treeBranch=null]      If passed, tree branch gets filled with the actually used dependencies.
 * @param {Array}   [opts.route=[]]             The dependency route if called recursively.
 * @param {Object}  [opts.toplevel=null]        The toplevel ast that contains all the parsed code.
 *
 * @returns {Object} An ast that contains main and relative modules. If opts.includeModules is true, all the dependencies will be included.
 */
async function bundleScript(main, opts) {
  opts = { moduleIds: {}, moduleRoute: [], ...opts }
  const paths = [].concat(opts.paths)
  const isBundlingComponent = !paths[0].endsWith('node_modules')
  const needTransform = isBundlingComponent || (opts.needTransform || false)
  const { root, includeModules, includeComponents, tree, treeBranch } = opts
  const { moduleIds, moduleRoute } = opts
  const componentIds = {}
  let toplevel = opts.toplevel
  let sourceMaps = []

  // `append()` could be call either when compiling components or when compiling modules.
  async function append(id, dependencies, factory) {
    if (componentIds[id]) return
    // When compiling spare components, `includeComponents` is false, no need to bundle dependencies.
    if (isBundlingComponent && id != main && !includeComponents) return

    let [, name, version, entry] = id.match(rModuleId)
    const [fpath, ext] = isBundlingComponent
      ? await findScript(entry, paths)
      : await findScript(`${name}/${entry}`, paths)

    if (!fpath && !factory) {
      throw new Error(`Unable to locate '${id}' in '${paths}'`)
    }

    if (ext != '.js') {
      entry = (entry + ext).replace(rExt, '')
      id = (id + ext).replace(rExt, '')
    }

    componentIds[id] = true
    factory = factory || (await readFile(fpath, 'utf8'))
    dependencies = dependencies || matchRequire.findAll(factory)

    for (var i = dependencies.length - 1; i >= 0; i--) {
      if (dependencies[i].endsWith('heredoc')) {
        dependencies.splice(i, 1)
      }
    }

    let result = { code: factory, map: null }
    let babelrcPath = isBundlingComponent
      ? await findBabelrc(fpath || path.join(paths[0], entry), { root })
      : await findBabelrc(fpath, { root: paths[0] })

    if (babelrcPath && needTransform) {
      result = transform(factory, {
        filename: `${id}.js`,
        filenameRelative: fpath ? path.relative(root, fpath) : id,
        sourceFileName: fpath ? path.relative(root, fpath) : id,
        extends: babelrcPath,
      })
      sourceMaps.push(result.map)
    }

    try {
      toplevel = UglifyJS.parse(define(id, dependencies, result.code), {
        // fpath might be undefined because we allow virtual components.
        filename: fpath ? path.relative(root, fpath) : id,
        toplevel
      })
    } catch (err) {
      throw new Error(`${err.message} (${err.filename}:${err.line}:${err.col})`)
    }

    await satisfy({ name, version, entry, id, dependencies })
  }

  async function satisfy(mod) {
    for (const dep of mod.dependencies) {
      if (rURI.test(dep)) continue

      if (dep.startsWith('.')) {
        await append(path.join(path.dirname(mod.id), dep))
        continue
      }

      // When bundling components, it is possibel to require components by absolute path, such as `require('lib/foo')`. On the other hand, when bundling node_modules, this feature isn't provided.
      if (isBundlingComponent) {
        const [fpath, ext] = await findScript(dep, paths)
        if (fpath) {
          const entry = ext != '.js' ? (dep + ext).replace(rExt, '') : dep
          await append([mod.name, mod.version, entry].join('/'))
          continue
        }
      }

      // If dependencies tree is available, and we're now sure that `dep` is not an internal dependency, try append `dep` as a module. The module isn't always appended actually since includeModules could be false. Either way, the moduleIds shall contain the modules that are required.
      if (tree) {
        if (moduleRoute.length == 0) moduleRoute.push(Object.keys(tree).pop())
        await appendModule(dep)
      }
    }
  }

  async function appendModule(dep) {
    const [, name, , entry] = dep.match(rModuleId)
    moduleRoute.push(name)
    const map = routeMap(moduleRoute, tree, treeBranch)

    if (!map) {
      console.warn(`Cannot find module ${dep}`, main, moduleRoute)
      moduleRoute.pop()
      return
    }

    const realEntry = entry || map.main
    const id = path.join(name, map.version, map.alias[realEntry] || realEntry)

    if (includeModules && !moduleIds[id]) {
      const pkgBase = name.split('/').reduce(function(result) {
        return path.resolve(result, '..')
      }, map.dir)

      const result = await bundleScript(id, {
        root, paths: pkgBase,
        includeModules, tree, treeBranch,
        moduleRoute, moduleIds,
        toplevel
      })
      toplevel = result.toplevel
    }

    moduleIds[id] = true
    moduleRoute.pop()
  }

  await append(main, opts.dependencies, opts.factory)
  return { toplevel, sourceMaps, moduleIds, componentIds }
}

/**
 * Wrap factory code into a CMD script.
 * @param  {string} id
 * @param  {Array}  dependencies
 * @param  {string} factory
 * @return {string}
 *
 * ```js
 * define(id, dependencies, function(require, exports, module) {
 *   factory
 * })
 * ```
 */
function define(id, dependencies, factory) {
  return `define(${JSON.stringify(id)}, ${JSON.stringify(dependencies)}, function(require, exports, module) {${factory}
})`
}

/**
 * Make a match function with specified pattern.
 * @param {string|string[]|RegExp} pattern
 * @returns {Function}
 */
function makeMatchFn(pattern) {
  if (!pattern) return () => false

  if (typeof pattern == 'function') {
    return pattern
  }
  else if (Array.isArray(pattern)) {
    return entry => pattern.includes(entry)
  }
  else if (pattern instanceof RegExp) {
    return entry => pattern.test(entry)
  }
  else {
    return entry => minimatch(entry, pattern)
  }
}

/**
 * The middleware and the compiler.
 */
class Porter {
  constructor(opts) {
    Object.assign(this, {
      root: process.cwd(),
      paths: 'components',
      dest: 'public',
      cacheExcept: [],
      cacheModuleQueue: Promise.resolve(),
      cachingModules: {},
      mangleExcept: [],
      transformNodeModules: [],
      serveSource: false,
      loaderConfig: {},
      ...opts
    })

    // Regulate settings
    this.paths = [].concat(this.paths).map(dir => path.resolve(this.root, dir))
    this.dest = path.resolve(this.root, this.dest)
    this.cacheExcept = [].concat(this.cacheExcept)
    this.mangleExcept = [].concat(this.mangleExcept)
    this.transformNodeModules = [].concat(this.transformNodeModules)

    // ServiceWorker relies on this to invalidate cache.
    this.loaderConfig.cacheExcept = [...this.cacheExcept]

    this.cache = new Cache({ root: this.root, dest: this.dest })
    if (this.cacheExcept.length > 0) {
      spawn('rm', ['-rf', ...this.cacheExcept], { cwd: this.dest })
        .then(() => debug(`Cache cleared (${path.relative(this.root, this.dest)})`))
        .catch(err => console.error(err.stack))
    }

    this.systemScriptCache = {}
    this.parsePromise = this.parse().catch(err => {
      this.parseError = err
    })
  }

  findMap({ name, version }) {
    const route = []

    function walk(map) {
      if (name in map && (!version || map[name].version == version)) {
        return Object.assign({ route, name }, map[name])
      }

      for (const prop in map) {
        route.push(prop)
        const result = walk(map[prop].dependencies)
        if (result) return result
        route.pop()
      }
    }

    return walk(this.tree)
  }

  async resolveModule({ name, entry }, { dir, parent }) {
    const pkgRoot = await closestModule(dir, name)
    const pkg = require(path.join(pkgRoot, 'package.json'))
    const main = typeof pkg.browser == 'string' ? pkg.browser : (pkg.main || 'index').replace(rExt, '')
    entry = (entry || main).replace(rExt, '').replace(/^\.\//, '')
    const existingModule = this.findMap({ name, version: pkg.version })

    if (existingModule && existingModule.entries[entry]) return existingModule

    // Re-use map if exists already.
    const result = name in parent.dependencies
      ? parent.dependencies[name]
      : { dir: pkgRoot, dependencies: {}, main, version: pkg.version, alias: {}, entries: {}, parent }

    // https://github.com/erzu/porter/issues/1
    // https://github.com/browserify/browserify-handbook#browser-field
    if (typeof pkg.browser == 'object') Object.assign(result.alias, pkg.browser)

    await this.resolveDependency(entry, result)
    result.entries[entry] = true
    return result
  }

  async resolveDependency(entry, map) {
    const { alias, dir, dependencies, parent } = map
    const resolved = this.resolved || (this.resolved = {})
    const [fpath, ext] = await findScript(entry, dir)

    // We do allow requiring components from node_modules. Hence give `findScript()` another try here.
    if (!fpath) {
      const [componentPath] = await findScript(entry, this.paths)
      if (componentPath == null) {
        throw new Error(`Unable to find '${entry}' in ${dir}`)
      }
    }
    if (ext != '.js') alias[entry] = `${entry}${ext}`.replace(rExt, '')
    if (resolved[fpath]) return

    const content = await readFile(fpath, 'utf8')
    const deps = matchRequire.findAll(content)
    resolved[fpath] = true

    for (const dep of deps) {
      if (dep.startsWith('.')) {
        const context = path.dirname(path.relative(dir, fpath))
        await this.resolveDependency(path.join(context, dep), map)
        continue
      }
      const [, name, , depEntry] = dep.match(rModuleId)

      if (name in parent.dependencies) {
        dependencies[name] = parent.dependencies[name]
      } else {
        dependencies[name] = await this.resolveModule({ name, entry: depEntry }, {
          dir, parent: map
        })
      }
    }
  }

  async resolveComponent(map, component) {
    const { alias, dependencies } = map

    for (const dep of component.dependencies) {
      const id = dep.startsWith('.')
        ? path.join(path.dirname(component.id), dep)
        : dep

      const [fpath, ext] = await findScript(id, this.paths)
      // Skip fellow components because they've been listed already.
      if (fpath) {
        if (ext != '.js') alias[id] = `${id}${ext}`.replace(rExt, '')
        continue
      }

      // A component is asked specifically, yet it cannot be found.
      if (!fpath && dep.startsWith('.')) {
        throw new Error(`Unable to resolve '${dep}' in component '${component.id}.js'`)
      }

      const [, name, , entry] = id.match(rModuleId)
      // require('//example.com/foo.js')
      if (rURI.test(name)) continue
      if (name in dependencies && dependencies[name].entries[entry]) continue

      try {
        await closestModule(this.root, name)
      } catch (err) {
        throw new Error(`Unable to resolve '${id}' in component '${component.id}.js'`)
      }

      dependencies[name] = await this.resolveModule({ name, entry }, { dir: this.root, parent: map })
    }
  }

  async parseMap() {
    const pkg = require(path.join(this.root, 'package.json'))
    const components = []

    // Glob all components within current path. Scripts within node_modules shall be ignored because a component shall never reside in that. Paths like `foo/node_modules` cannot be ruled out by current approach.
    for (const dir of this.paths) {
      const entries = await glob('{*.js,!(node_modules)/**/*.js}', { cwd: dir })
      for (const entry of entries) {
        const fpath = path.join(dir, entry)
        if ((await lstat(fpath)).isFile()) {
          components.push({
            id: entry.replace(rExt, ''),
            dependencies: matchRequire.findAll(await readFile(fpath, 'utf8'))
          })
        }
      }
    }

    this.tree = {
      [pkg.name]: {
        version: pkg.version,
        dependencies: {},
        main: pkg.main ? pkg.main.replace(rExt, '') : 'index',
        alias: {}
      }
    }

    for (const component of components) {
      await this.resolveComponent(this.tree[pkg.name], component)
    }
  }

  walkMap(func) {
    const walk = (map, fn) => {
      for (const name in map) {
        fn(name, map[name])
        walk(map[name].dependencies, fn)
      }
    }
    walk(this.tree, func)
  }

  flatMap() {
    const modules = {}
    const system = {}

    this.walkMap((name, { alias, dependencies, main, version }) => {
      const copies = modules[name] || (modules[name] = {})
      const copy = copies[version] || (copies[version] = {})

      if (!/^(?:\.\/)?index(?:.js)?$/.test(main)) {
        copy.main = main
      }

      if (dependencies && Object.keys(dependencies).length > 0) {
        if (!copy.dependencies) copy.dependencies = {}
        for (const dep in dependencies) {
          copy.dependencies[dep] = dependencies[dep].version
        }
      }

      if (alias && Object.keys(alias).length > 0)  {
        copy.alias = Object.assign({}, copy.alias, alias)
      }
    })

    for (const name in this.tree) {
      const { version, main } = this.tree[name]
      Object.assign(system, {
        name, version,
        main: main ? main.replace(rExt, '') : 'index',
        modules
      })
    }

    return system
  }

  atImport() {
    const resolve = (id, baseDir, importOptions) => {
      if (id.startsWith('.')) return path.join(baseDir, id)

      const [, name, , entry] = id.match(rModuleId)

      if (name in this.system.modules) {
        const { dir } = this.findMap({ name })
        return path.join(dir, entry)
      } else {
        return findStyle(id, importOptions.path)
      }
    }

    return atImport({
      path: [ path.join(process.cwd(), 'node_modules') ].concat(this.paths),
      resolve
    })
  }

  async parse() {
    if (['name', 'version', 'main', 'modules'].every(name => !!this.loaderConfig[name])) {
      this.system = this.loaderConfig
    } else {
      await this.parseMap()
      this.resolved = {}
      this.system = this.flatMap()
      Object.assign(this.loaderConfig, this.system)
    }

    this.importer = postcss().use(this.atImport())
    this.prefixer = postcss().use(autoprefixer())
  }

  isSource(id) {
    if (!this.serveSource) return false

    if (id.startsWith('node_modules')) {
      const [, name] = id.replace(/^node_modules\//, '').match(rModuleId)
      // #1 cannot require('mocha') just yet
      return name in this.system.modules || name == 'mocha'
    }

    const fpath = path.join(this.root, id)
    for (const dir of this.paths) {
      if (fpath.startsWith(dir)) return true
    }

    return false
  }

  async readSource(id) {
    const fpath = path.join(this.root, id)

    if (await exists(fpath)) {
      const [content, stats] = await Promise.all([readFile(fpath, 'utf8'), lstat(fpath)])
      return [content, {
        'Last-Modified': stats.mtime.toJSON()
      }]
    }
  }

  async readStyle(id) {
    const { cache, dest, importer, prefixer, root, system } = this
    let [, name, , entry] = id.match(rModuleId)
    if (!(name in system.modules)) {
      name = system.name
      entry = id
    }
    const destPath = path.join(dest, id)
    const [fpath] = await findStyle(entry, this.paths)

    if (!fpath) return

    const source = await readFile(fpath, 'utf8')
    const processOpts = {
      from: path.relative(root, fpath),
      to: path.relative(root, destPath),
      map: { inline: false }
    }
    const result = await importer.process(source, processOpts)
    let content = await cache.read(id, result.css)

    if (!content) {
      processOpts.map.prev = result.map
      const resultWithPrefix = await prefixer.process(result.css, processOpts)

      await Promise.all([
        cache.write(id, result.css, resultWithPrefix.css),
        cache.writeFile(id + '.map', resultWithPrefix.map)
      ])
      content = resultWithPrefix.css
    }

    return [content, {
      'Last-Modified': (await lstat(fpath)).mtime.toJSON()
    }]
  }

  async readSystemScript(id) {
    if (!['loader.js', 'porter-sw.js'].includes(id)) {
      throw new Error(`Unable to read '${id}' as system script`)
    }

    if ((inProduction || !debug.enabled) && id in this.systemScriptCache) {
      return this.systemScriptCache[id]
    }
    const fpath = path.join(__dirname, '..', id)
    const [content, stats] = await Promise.all([readFile(fpath, 'utf8'), lstat(fpath)])
    const result =  [content, { 'Last-Modified': stats.mtime.toJSON() }]
    this.systemScriptCache[id] = result
    return result
  }

  async readScript(id, isMain) {
    const [, name] = id.match(rModuleId)
    const { paths, system } = this

    if (name === system.name) {
      return await this.readComponent(id, isMain)
    }
    else if ((await findScript(id, paths, ['']))[0]) {
      return await this.readComponent(`${system.name}/${system.version}/${id}`, isMain)
    }
    else {
      return await this.readModule(id)
    }
  }

  async formatMain(id, content) {
    const { loaderConfig } = this
    const loaderSource = await this.readSystemScript('loader.js')

    return [
      loaderSource,
      `porter.config(${JSON.stringify(loaderConfig)})`,
      content,
      `porter["import"](${JSON.stringify(id.replace(rExt, ''))})`
    ].join('\n')
  }

  async readComponent(id, isMain) {
    const { cache, paths, root, system } = this
    let [, name, version, entry] = id.match(rModuleId)

    // Disallow access of components without version like `${system.name}/${entry}` because it is error prone. #36
    if (!version) return
    if (!(name in system.modules)) {
      name = system.name
      entry = id
    }

    const [fpath] = await findAsset(entry, paths, ['', '/index.js'])
    if (!fpath) return
    const stats = await lstat(fpath)
    const source = await readFile(fpath, 'utf8')
    const babelrcPath = await findBabelrc(fpath, { root })
    let content = babelrcPath ? (await cache.read(id, source)) : source

    if (!content) {
      const result = transform(source, {
        filename: id,
        filenameRelative: path.relative(root, fpath),
        sourceFileName: path.relative(root, fpath),
        extends: babelrcPath
      })
      await Promise.all([
        cache.write(id, source, result.code),
        cache.writeFile(`${id}.map`, JSON.stringify(result.map, function(k, v) {
          if (k != 'sourcesContent') return v
        }))
      ])
      content = result.code
    }

    const dependencies = matchRequire.findAll(content)
    content = define(id.replace(rExt, ''), dependencies, content)
    content = isMain
      ? await this.formatMain(id, content)
      : [content, `//# sourceMappingURL=./${path.basename(id)}.map`].join('\n')

    return [content, {
      'Last-Modified': stats.mtime.toJSON()
    }]
  }

  async cacheModule({ name, version, entry }) {
    entry = entry.replace(rExt, '')
    const { dir, entries } = this.findMap({ name, version })
    const { cachingModules, root } = this

    // Skip caching of internal entries.
    if (!(entry in entries)) return

    const id = `${name}/${version}/${entry}`
    if (cachingModules[id]) return

    // Modules might be linked with `npm link`. If dir is symbolic link, resolve it with `fs.realpath()`. If not, applying a `path.resolve()` here won't obfuscate the real directory path.
    const realDir = path.resolve(dir, '..', await realpath(dir))

    // Skip caching linked modules because it's highly likely that the developer wants to debug that module.
    if (!realDir.startsWith(root)) return

    this.cacheModuleQueue = this.cacheModuleQueue.then(
      this.spawnCacheModule({ name, version, entry, dir })
    )
    await this.cacheModuleQueue
  }

  async spawnCacheModule({ name, version, entry, dir }) {
    const { cachingModules, dest, mangleExcept, root } = this
    const id = `${name}/${version}/${entry}`
    const args = [
      path.join(__dirname, '../bin/compileModule.js'),
      '--id', id,
      '--dest', dest,
      '--paths', dir,
      '--root', root,
      '--source-root', '/'
    ]
    if (mangleExcept.includes(name)) args.push('--mangle')
    await spawn(process.argv[0], args, { stdio: 'inherit' })
    cachingModules[id] = false
  }

  async readModule(id, isMain) {
    const { cache, cacheExcept, root, transformNodeModules } = this
    const [, name, version, entry] = id.match(rModuleId)
    const map = this.findMap({ name, version })

    // It's possible that the id passed to `this.readModule()` isn't valid.
    if (!map) return

    const { dir } = map
    const fpath = path.join(dir, entry)

    if (!fpath) return
    if (!cacheExcept.includes(name)) {
      this.cacheModule({ name, version, entry }).catch(err => console.error(err.stack))
    }

    const babelrcPath = await findBabelrc(fpath, { root: dir })
    let source = await readFile(fpath, 'utf8')
    let content = transformNodeModules.includes(name) && babelrcPath
      ? (await cache.read(id, source))
      : source

    if (!content) {
      const result = transform(source, {
        filename: id,
        filenameRelative: path.relative(root, fpath),
        sourceFileName: path.relative(root, fpath),
        extends: babelrcPath,
      })
      await Promise.all([
        cache.write(id, source, result.code),
        cache.writeFile(`${id}.map`, JSON.stringify(result.map, function(k, v) {
          if (k != 'sourcesContent') return v
        }))
      ])
      content = result.code
    }
    const stats = await lstat(fpath)
    const dependencies = matchRequire.findAll(content)
    content = define(id.replace(rExt, ''), dependencies, content)

    return [content, {
      'Last-Modified': stats.mtime.toJSON()
    }]
  }

  async readAsset(id, isMain) {
    // Assets will not be available until system is ready.
    await this.parsePromise
    if (this.parseError) throw this.parseError

    const ext = path.extname(id)
    let result = null

    if (id === 'loader.js') {
      result = await this.readSystemScript(id)
      result[0] = [result[0], `porter.config(${JSON.stringify(this.loaderConfig)})`].join('\n')
    }
    else if (id === 'loaderConfig.json') {
      result = [JSON.stringify(this.system), {
        'Last-Modified': (new Date()).toJSON()
      }]
    }
    else if (id === 'porter-sw.js') {
      result = await this.readSystemScript(id)
    }
    else if (this.isSource(id)) {
      result = await this.readSource(id)
    }
    else if (ext === '.js') {
      result = await this.readScript(id, isMain)
    }
    else if (ext === '.css') {
      result = await this.readStyle(id, isMain)
    }
    else if (rExt.test(ext)) {
      const [fpath] = await findAsset(id, this.paths)
      if (fpath) {
        const [content, stats] = await Promise.all([readFile(fpath), lstat(fpath)])
        result = [content, {
          'Last-Modified': stats.mtime.toJSON()
        }]
      }
    }

    if (result) {
      Object.assign(result[1], {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.lookup(ext),
        ETag: crypto.createHash('md5').update(result[0]).digest('hex')
      })
    }

    return result
  }

  /**
   * Compile stylesheets in components
   *
   * @param {Object}    opts
   * @param {string}    opts.dest
   * @param {string}    opts.match
   * @param {string[]}  opts.paths
   * @param {string}    opts.root
   */
  async compileStyleSheets(opts) {
    await this.parsePromise
    const { paths, root, system } = this
    const dest = path.resolve(this.dest || opts.dest, system.name, system.version)
    const match = opts.match || '{main,main/**/*}.css'

    const processor = postcss()
      .use(this.atImport())
      .use(autoprefixer())

    for (let i = 0; i < paths.length; i++) {
      const currentPath = paths[i]
      const entries = await glob(match, { cwd: currentPath })

      for (const entry of entries) {
        try {
          await this.compileStyleSheet(processor, {
            root, dest, entry, path: currentPath
          })
        } catch (err) {
          if (err instanceof SyntaxError) {
            console.error(err.stack)
          } else {
            // the original err.stack does not give anything useful yet.
            throw new Error(`Unable to compile '${entry}'`)
          }
        }
      }
    }
  }

  /**
   * Compile stylesheet in components
   *
   * @param {Object} processor
   * @param {Object} opts
   * @param {string} opts.dest
   * @param {string} opts.entry
   * @param {string} opts.path
   * @param {string} opts.root
   */
  async compileStyleSheet(processor, opts) {
    const { root, path: currentPath, dest, entry } = opts

    const destPath = path.join(dest, entry)
    const fpath = path.join(currentPath, entry)
    const source = await readFile(fpath, 'utf8')

    const result = await processor.process(source, {
      from: path.relative(root, fpath),
      to: path.relative(root, destPath),
      map: { inline: false, sourcesContent: false }
    })

    await mkdirp(path.dirname(destPath))
    await Promise.all([
      writeFile(destPath, result.css),
      writeFile(`${destPath}.map`, result.map)
    ])
  }

  async parseLoader() {
    return UglifyJS.parse((await this.readSystemScript('loader.js'))[0], {
      filename: 'loader.js'
    })
  }

  /**
   * @param {string}           entry
   * @param {Object}           opts
   * @param {Array}           [opts.dependencies]         Dependencies of the entry module
   * @param {string}          [opts.dest]
   * @param {string}          [opts.factory]              Factory code of the entry module
   * @param {boolean}         [opts.includeModules]       Whethor or not to include node_modules
   * @param {string|string[]} [opts.paths=components]
   * @param {string}          [opts.root=process.cwd()]
   * @param {string}          [opts.sourceRoot]
   *
   * @await {ProcessResult}
   */
  async compileComponent(entry, opts) {
    await this.parsePromise
    opts = {
      includeLoader: false,
      includeModules: true,
      includeComponents: true,
      ...opts
    }
    const { dest, loaderConfig, paths, root, system, tree } = this
    const { includeLoader, includeModules, includeComponents } = opts

    const fpath = opts.factory ? null : (await findScript(entry, paths))[0]
    const id = [system.name, system.version, entry].join('/')
    const treeBranch = {}

    let toplevel = includeLoader ? (await this.parseLoader()) : null
    const bundleResult = await bundleScript(id, {
      root, paths, tree, treeBranch,
      factory: opts.factory,
      toplevel,
      includeModules, includeComponents
    })
    toplevel = bundleResult.toplevel

    if (includeLoader) {
      // If not all modules are included, use the full dependencies tree instead of
      // the dependencies tree branch generated while bundling.
      toplevel = UglifyJS.parse(`
porter.config(${JSON.stringify({ ...loaderConfig, ...this.flatMap(includeModules ? treeBranch : tree) })})
porter["import"](${JSON.stringify(id)})
`, { filename: fpath ? path.relative(root, fpath) : `${entry}.js`, toplevel })
    }

    const { js, map } = minifyScript(id, toplevel, {
      sourceMaps: bundleResult.sourceMaps,
      sourceRoot: opts.sourceRoot
    })

    if (!opts.buffer) await compileScript(id, { dest, js, map })
    const { moduleIds, componentIds } = bundleResult
    return { js, map, moduleIds, componentIds }
  }

  /**
   * @param {string}  id
   * @param {Object}  opts
   * @param {Object} [opts.tree=null]             If passed, will include all the dependencies
   * @param {string} [opts.dest]                  If passed, will write .js and .map files
   * @param {string} [opts.paths=node_modules]    Actually only the first load path will be used
   * @param {string} [opts.root=process.cwd()]
   * @param {string} [opts.sourceRoot]
   *
   * @return {Object}
   */
  async compileModule(id, opts) {
    await this.parsePromise
    opts = { paths: 'node_modules', ...opts }
    const { dest, root, tree } = this
    const { paths, needTransform } = opts
    const currentPath = path.resolve(root, Array.isArray(paths) ? paths[0] : paths)

    const { toplevel, sourceMaps, moduleIds } = await bundleScript(id, {
      root, paths: currentPath, tree,
      moduleRoute: opts.moduleRoute,
      needTransform,
    })

    const result = minifyScript(id, toplevel, {
      sourceMaps, sourceRoot: opts.sourceRoot,
      mangle: opts.mangle
    })

    if (!opts.buffer) await compileScript(id, { dest, ...result })
    return { moduleIds, ...result }
  }

  /**
   * Compile all components and modules within the root directory into dest folder.
   * @param {Object}               opts
   * @param {string|Array|RegExp} [opts.match]              The match pattern to find entry components to compile
   * @param {string|Array|RegExp} [opts.spareMatch]         The match pattern to find spare components to compile
   * @param {string}              [opts.sourceRoot]         The source root
   * @example
   * compileAll({ match: 'pages/*', spareMatch: 'frames/*' })
   */
  async compileAll(opts = {}) {
    if (!opts.match) {
      throw new Error('Please specify entry components with opts.match')
    }
    await this.parsePromise
    const { sourceRoot } = opts
    const { paths, loaderConfig, transformNodeModules } = this
    const matchFn = makeMatchFn(opts.match)
    const spareMatchFn = makeMatchFn(opts.spareMatch)
    const isPreloadFn = makeMatchFn([].concat(loaderConfig.preload))
    const { name: appName, version: appVersion } = this.system
    const doneModuleIds = {}
    let wildModuleIds = {}

    const compileComponentWithoutBundling = async (id) => {
      const [, , , entry] = id.match(rModuleId)
      const { moduleIds, componentIds } = await this.compileComponent(entry, {
        includeModules: false, includeComponents: false,
        sourceRoot
      })
      doneModuleIds[id] = true
      Object.assign(wildModuleIds, moduleIds, componentIds)
    }

    const compileComponentWithBundling = async (id) => {
      const [, , , entry] = id.match(rModuleId)
      const { moduleIds } = await this.compileComponent(entry, {
        includeLoader: true, includeModules: false,
        sourceRoot,
      })
      doneModuleIds[id] = true
      Object.assign(wildModuleIds, moduleIds)
    }

    // Compile module with internal files bundled into entry, excluding external dependencies. Actually this is the default behavior of `Porter.compileModule()`.
    const compileModuleWithBundling = async (id) => {
      const [, name, version ] = id.match(rModuleId)
      const map = this.findMap({ name, version })
      const pkgBase = name.split('/').reduce(function(result) {
        return path.resolve(result, '..')
      }, map.dir)

      const { moduleIds } = await this.compileModule(id, {
        paths: pkgBase,
        moduleRoute: [...map.route, name],
        needTransform: transformNodeModules.includes(name),
        sourceRoot
      })
      doneModuleIds[id] = true
      Object.assign(wildModuleIds, moduleIds)
    }

    for (const currentPath of paths) {
      const entries = await glob('{*.js,!(node_modules)/**/*.js}', { cwd: currentPath })

      for (const entryPath of entries) {
        const entry = entryPath.replace(rExt, '')
        const id = [appName, appVersion, entry].join('/')

        if (matchFn(entryPath)) {
          await compileComponentWithBundling(id)
        }
        else if (isPreloadFn(entry) || spareMatchFn(entryPath)) {
          await compileComponentWithoutBundling(id)
        }
      }
    }

    while (Object.keys(wildModuleIds).length > 0) {
      for (const id in wildModuleIds) {
        if (doneModuleIds[id]) continue
        const [, name] = id.match(rModuleId)

        if (name === appName) {
          await compileComponentWithoutBundling(id)
        } else {
          await compileModuleWithBundling(id)
        }
      }

      wildModuleIds = Object.keys(wildModuleIds).reduce(function(result, id) {
        if (!doneModuleIds[id]) result[id] = false
        return result
      }, {})
    }
  }

  func() {
    const readAsset = this.readAsset.bind(this)

    return function Porter_func(req, res, next) {
      if (res.headerSent) return next()

      const id = req.path.slice(1)
      const isMain = 'main' in req.query

      readAsset(id, isMain).then(function(result) {
        if (result) {
          res.statusCode = 200
          res.set(result[1])
          if (req.fresh) {
            res.statusCode = 304
          } else {
            res.write(result[0])
          }
          res.end()
        } else {
          next()
        }
      }).catch(next)
    }
  }

  gen() {
    const readAsset = this.readAsset.bind(this)

    return function* Porter_generator(next) {
      const ctx = this
      if (ctx.headerSent) return yield next

      const id = ctx.path.slice(1)
      const isMain = 'main' in ctx.query
      const result = yield readAsset(id, isMain)

      if (result) {
        ctx.status = 200
        ctx.set(result[1])
        if (ctx.fresh) {
          ctx.status = 304
        } else {
          ctx.body = result[0]
        }
      } else {
        yield next
      }
    }
  }

  async() {
    const readAsset = this.readAsset.bind(this)

    return async function Porter_async(ctx, next) {
      if (ctx.headerSent) return await next

      const id = ctx.path.slice(1)
      const isMain = 'main' in ctx.query
      const result = await readAsset(id, isMain)

      if (result) {
        ctx.status = 200
        ctx.set(result[1])
        if (ctx.fresh) {
          ctx.status = 304
        } else {
          ctx.body = result[0]
        }
      } else {
        await next
      }
    }
  }
}

module.exports = Porter
