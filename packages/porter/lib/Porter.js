'use strict'

const atImport = require('postcss-import')
const autoprefixer = require('autoprefixer')
const babel = require('babel-core')
const crypto = require('crypto')
const debug = require('debug')('porter')
const looseEnvify = require('loose-envify')
const mime = require('mime')
const minimatch = require('minimatch')
const path = require('path')
const postcss = require('postcss')
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
function mergeTree(treeBranch, tree, route) {
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
 * @param {string[]} route The route of the dependency
 * @param {Object} tree The dependencies tree
 * @param {Object} treeBranch The actually required dependencies tree, which is a branch of the big tree
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
  if (result && treeBranch) mergeTree(treeBranch, tree, route)
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

function envify(file, content) {
  return new Promise(resolve => {
    const stream = looseEnvify(file, { BROWSER: true, NODE_ENV: 'development' })
    let buf = ''
    stream.on('data', chunk => buf += chunk)
    stream.on('end', () => resolve(buf))
    stream.end(content)
  })
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
  const fpath = path.join(dest, `${id}.js`)

  await mkdirp(path.dirname(fpath))
  await Promise.all([
    writeFile(fpath, [js, `//# sourceMappingURL=./${path.basename(id)}.js.map`].join('\n')),
    writeFile(`${fpath}.map`, map)
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

async function transformScript(id, { cache, dir, fpath, enableEnvify, enableTransform, root }) {
  const source = await readFile(fpath, 'utf8')
  // fpath might be undefined when transforming fake components
  const babelrcPath = await findBabelrc(fpath || dir, { root: dir || root })

  if (!enableTransform || !babelrcPath) {
    if (enableEnvify) {
      return { code: await envify(fpath, source) }
    } else {
      return { code: source }
    }
  }

  // When compiling for production, cache should be disabled otherwise the compiled result might be lacking source map.
  if (cache) {
    const code = await cache.read(id, source)
    if (code) return { code }
  }

  const result = transform(enableEnvify ? (await envify(fpath, source)) : source, {
    filename: id,
    filenameRelative: path.relative(root, fpath),
    sourceFileName: path.relative(root, fpath),
    extends: babelrcPath,
  })

  if (cache) {
    await Promise.all([
      cache.write(id, source, result.code),
      cache.writeFile(`${id}.map`, JSON.stringify(result.map, function(k, v) {
        if (k != 'sourcesContent') return v
      }))
    ])
  }

  return result
}

/**
 * Bundle a component or module, with its relative dependencies included by default.
 * @param {Object}   mod
 * @param {string}   mod.name
 * @param {string}   mod.version
 * @param {string}   mod.entry
 * @param {Object}   opts
 * @param {string}   opts.paths                   The load paths
 * @param {boolean} [opts.enableAbsoluteId=false] Whether or not to allow require by absolute ids
 * @param {boolean} [opts.enableBundle=true]      Whether or not to bundle internal dependencies
 * @param {boolean} [opts.enableEnvify=false]     Whether or not to replace environment variables such as `process.env.NODE_ENV`
 * @param {boolean} [opts.enableTransform=false]  Whether or not to enable transformations on factory code
 * @param {Object}  [opts.toplevel=null]          The toplevel ast that contains all the bundled scripts
 * @returns {Object} { toplevel, sourceMaps, wildModules }
 */
async function bundleScript({ name, version, entry: mainEntry }, opts) {
  opts = {
    doneIds: {},
    enableBundle: true,
    enableEnvify: false,
    enableTransform: false,
    enableAbsoluteId: false,
    ...opts
  }
  const paths = [].concat(opts.paths)
  const { root, enableBundle, enableEnvify, enableTransform, enableAbsoluteId, doneIds } = opts
  if (!root) throw new Error('Please speicify script root')
  const wildModules = []
  let toplevel = opts.toplevel
  let sourceMaps = []

  // `append()` could be call either when compiling components or when compiling modules.
  async function append(entry, { dependencies, factory, fpath }) {
    const id = `${name}/${version}/${entry}`
    if (doneIds[id]) return
    if (entry !== mainEntry && enableBundle === false) {
      return wildModules.push({ name, version, entry })
    }

    doneIds[id] = true

    if (!dependencies) dependencies = matchRequire.findAll(factory)
    for (let i = dependencies.length - 1; i >= 0; i--) {
      if (dependencies[i].endsWith('heredoc')) dependencies.splice(i, 1)
    }

    try {
      toplevel = UglifyJS.parse(define(id, dependencies, factory), {
        // fpath might be undefined because we allow virtual components.
        filename: fpath ? path.relative(root, fpath) : id,
        toplevel
      })
    } catch (err) {
      throw new Error(`${err.message} (${err.filename}:${err.line}:${err.col})`)
    }

    await satisfy(entry, dependencies)
  }

  async function appendFile(entry, { fpath, ext }) {
    if (ext != '.js') entry = (entry + ext).replace(rExt, '')
    const { code: factory, map } = await transformScript(entry, { fpath, enableEnvify, enableTransform, root })
    if (map) sourceMaps.push(map)
    await append(entry, { factory, fpath })
  }

  async function satisfy(entry, dependencies) {
    for (const dep of dependencies) {
      // Ignore require('//example.com/foo.js')
      if (rURI.test(dep)) continue

      // Allow both `require('./foo')` and `require('lib/foo')`
      if (dep.startsWith('.') || enableAbsoluteId) {
        const id = dep.startsWith('.') ? path.join(path.dirname(entry), dep) : dep
        const [fpath, ext] = await findScript(id, paths)
        if (fpath) {
          await appendFile(id, { fpath, ext })
          continue
        }
      }

      // External modules or missing comonents
      const [, depName, , depEntry] = dep.match(rModuleId)
      wildModules.push({ name: depName, entry: depEntry })
    }
  }

  if (opts.factory) {
    const { dependencies, factory } = opts
    await append(mainEntry, { dependencies, factory })
  } else {
    const [fpath, ext] = await findScript(mainEntry, paths)
    if (fpath) {
      await appendFile(mainEntry, { fpath, ext })
    } else {
      throw new Error(`missing entry '${mainEntry}' in ${paths}`)
    }
  }

  return { toplevel, sourceMaps, doneIds, wildModules }
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

class ParseError extends Error {
  constructor(message) {
    super(message)
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
      cacheModuleIds: {},
      mangleExcept: [],
      transformModuleNames: [],
      serveSource: false,
      loaderConfig: {},
      ...opts
    })

    // Regulate settings
    this.paths = [].concat(this.paths).map(dir => path.resolve(this.root, dir))
    this.dest = path.resolve(this.root, this.dest)
    this.cacheExcept = [].concat(this.cacheExcept)
    this.cacheDest = this.cacheDest ? path.resolve(this.root, this.cacheDest) : this.dest
    this.mangleExcept = [].concat(this.mangleExcept)
    this.transformModuleNames = [].concat(this.transformModuleNames)

    // ServiceWorker relies on this to invalidate cache.
    this.loaderConfig.cacheExcept = [...this.cacheExcept]

    this.systemScriptCache = {}
    this.parsePromise = this.parse().catch(err => {
      this.parseError = err
    })

    this.cache = new Cache({ root: this.root, dest: this.cacheDest })
    if (this.cacheExcept.length > 0) {
      (async () => {
        if (await exists(this.cacheDest)) {
          await spawn('rm', ['-rf', ...this.cacheExcept], { cwd: this.cacheDest })
          debug(`Cache cleared (${this.cacheDest})`)
        }
      })().catch(err => console.error(err.stack))
    }
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
    const main = typeof pkg.browser == 'string' ? pkg.browser : pkg.main
    const mainEntry = main ? main.replace(rExt, '').replace(/^\.\//, '') : 'index'

    if (!entry) entry = mainEntry

    const id = `${name}/${pkg.version}/${entry}`
    const { resolvingIds } = this

    if (resolvingIds[id]) {
      // Copy the resolved module to current parent's dependencies.
      parent.dependencies[name] = await resolvingIds[id]
    } else {
      await (resolvingIds[id] = this.doResolveModule({ name, entry }, {
        dir: pkgRoot, parent, main: mainEntry, pkg
      }))
    }
  }

  async doResolveModule({ name, entry }, { dir, parent, main, pkg }) {
    const result = parent.dependencies[name] || (parent.dependencies[name] = {
      name, version: pkg.version, main, dir, parent,
      alias: {}, dependencies: {}, entries: {}, browserify: pkg.browserify
    })

    // https://github.com/erzu/porter/issues/1
    // https://github.com/browserify/browserify-handbook#browser-field
    if (typeof pkg.browser == 'object') Object.assign(result.alias, pkg.browser)
    await this.resolveDependency(entry, result)
    result.entries[entry] = true

    return result
  }

  isDependency(pkg, name) {
    return (pkg.dependencies && name in pkg.dependencies) ||
      (pkg.devDependencies && name in pkg.devDependencies) ||
      (pkg.peerDependencies && name in pkg.peerDependencies)
  }

  async resolveDependency(entry, map) {
    const { alias, dir, dependencies, parent } = map
    const [fpath, ext] = await findScript(entry, dir)

    if (!fpath) throw new ParseError(`missing file ${dir}/${entry}.js`)
    if (ext != '.js') alias[entry] = `${entry}${ext}`.replace(rExt, '')

    const pkg = require(`${dir}/package.json`)
    const content = await readFile(fpath, 'utf8')
    const deps = matchRequire.findAll(content)

    // Prevent from falling into dead loop if cyclic dependencies happens.
    const { resolvingPaths } = this
    if (resolvingPaths[fpath]) return
    resolvingPaths[fpath] = true

    for (const dep of deps) {
      if (dep.startsWith('.')) {
        const context = path.dirname(path.relative(dir, fpath))
        await this.resolveDependency(path.join(context, dep), map)
        continue
      }
      const [, name, , depEntry] = dep.match(rModuleId)

      if (name in parent.dependencies) {
        dependencies[name] = parent.dependencies[name]
      }
      else if (this.isDependency(pkg, name)) {
        await this.resolveModule({ name: name, entry: depEntry }, {
          dir, parent: map
        })
      }
      else if (await this.isComponent(dep)) {
        // #38 cyclic dependencies between components and modules
      }
      else {
        throw new ParseError(`unmet dependency ${dir}/${entry}.js requires '${dep}'`)
      }
    }
  }

  async resolveComponent(entry, { fpath, map }) {
    const { alias, dependencies } = map
    const deps = matchRequire.findAll(await readFile(fpath, 'utf8'))

    for (const dep of deps) {
      const id = dep.startsWith('.')
        ? path.join(path.dirname(entry), dep)
        : dep

      // require('https://example.com/foo.js')
      if (rURI.test(dep)) continue

      const [depPath, ext] = await findScript(id, this.paths)
      // Skip fellow components because they've been listed already.
      if (depPath) {
        if (ext != '.js') alias[id] = `${id}${ext}`.replace(rExt, '')
        continue
      }

      // A component is asked specifically, yet it cannot be found.
      if (!depPath && dep.startsWith('.')) {
        throw new ParseError(`unmet dependency ${fpath} requires '${dep}'`)
      }

      const [, name, , depEntry] = id.match(rModuleId)
      // Current dep is parsed already.
      if (name in dependencies && dependencies[name].entries[depEntry]) continue
      // Requiring a component by fullname, which is rare but convenient in isolated component development. See packages/porter-component for example.
      if (name == map.name) continue

      try {
        await closestModule(this.root, name)
      } catch (err) {
        throw new ParseError(`unmet dependency ${fpath} requires '${dep}'`)
      }

      await this.resolveModule({ name, depEntry }, { dir: this.root, parent: map })
    }
  }

  async parseMap() {
    const pkg = require(path.join(this.root, 'package.json'))

    this.resolvingIds = {}
    this.resolvingPaths = {}
    this.tree = {
      [pkg.name]: {
        name: pkg.name,
        version: pkg.version,
        dependencies: {},
        main: pkg.main ? pkg.main.replace(rExt, '') : 'index',
        alias: {}
      }
    }

    const resolveEntry = async (dir, entry) => {
      const fpath = path.join(dir, entry)
      // Might glob paths like `/foo/bar/chart.js`, which is a directory actually.
      if (!(await lstat(fpath)).isFile()) return
      try {
        await this.resolveComponent(entry.replace(rExt, ''), { fpath, map: this.tree[pkg.name] })
      } catch (err) {
        if (err instanceof ParseError) {
          console.warn(`WARN ${err.message}`, pkg.name, this.root)
        } else {
          throw err
        }
      }
    }

    // Glob all components within current path. Scripts within node_modules shall be ignored because a component shall never reside in that. Paths like `foo/node_modules` cannot be ruled out by current approach.
    for (const dir of this.paths) {
      const entries = await glob('{*.js,!(node_modules)/**/*.js}', { cwd: dir })
      await Promise.all(entries.map(entry => resolveEntry(dir, entry)))
    }
  }

  walkTree(tree, func) {
    const walk = (subtree, fn) => {
      for (const name in subtree) {
        fn(name, subtree[name])
        walk(subtree[name].dependencies, fn)
      }
    }
    walk(tree, func)
  }

  flatTree(tree = this.tree) {
    const modules = {}
    const system = {}

    this.walkTree(tree, (name, { alias, dependencies, main, version }) => {
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

    for (const name in tree) {
      const { version, main } = tree[name]
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
        return findStyle(id, importOptions.path).then(result => result[0])
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
      this.system = this.flatTree()
      Object.assign(this.loaderConfig, this.system)
    }

    this.cacheExcept.push(this.system.name)
    this.importer = postcss().use(this.atImport())
    this.prefixer = postcss().use(autoprefixer())
  }

  async isSource(id) {
    if (!this.serveSource) return false

    if (id.startsWith('node_modules')) {
      const [, name] = id.replace(/^node_modules\//, '').match(rModuleId)
      // #1 cannot require('mocha') just yet
      return name in this.system.modules || name == 'mocha'
    }

    const fpath = path.join(this.root, id)
    for (const dir of this.paths) {
      if (fpath.startsWith(dir) && (await exists(fpath))) return true
    }

    return false
  }

  /**
   * Check if current module is actually a component
   * @param {Object} mod
   * @param {string} mod.name
   * @param {string} [mod.entry]
   */
  async isComponent(entry) {
    return (await findScript(entry, this.paths))[0] != null
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
    let code = await cache.read(id, result.css)

    if (!code) {
      processOpts.map.prev = result.map
      const resultWithPrefix = await prefixer.process(result.css, processOpts)

      await Promise.all([
        cache.write(id, result.css, resultWithPrefix.css),
        cache.writeFile(id + '.map', resultWithPrefix.map)
      ])
      code = resultWithPrefix.css
    }

    return [code, {
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
    const [content, stats] = await Promise.all([
      readFile(fpath, 'utf8'),
      lstat(fpath)
    ])
    const result =  [await envify(fpath, content), { 'Last-Modified': stats.mtime.toJSON() }]
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
    const loaderSource = (await this.readSystemScript('loader.js'))[0]

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
    let { code } = await transformScript(id, {
      cache, root, dir: root, fpath,
      enableEnvify: true,
      enableTransform: true
    })

    const dependencies = matchRequire.findAll(code)
    code = define(id.replace(rExt, ''), dependencies, code)
    code = isMain
      ? await this.formatMain(id, code)
      : [code, `//# sourceMappingURL=./${path.basename(id)}.map`].join('\n')

    return [code, {
      'Last-Modified': stats.mtime.toJSON()
    }]
  }

  async cacheModule({ name, version, entry }) {
    entry = entry.replace(rExt, '')
    const { dir, entries, alias, browserify } = this.findMap({ name, version })
    const { root } = this

    let unaliasEntry = entry
    for (const prop in alias) {
      if (alias[prop] == entry) {
        unaliasEntry = prop
        break
      }
    }
    // Skip caching of internal entries.
    if (!(unaliasEntry in entries)) return

    // Modules might be linked with `npm link`. If dir is symbolic link, resolve it with `fs.realpath()`. If not, applying a `path.resolve()` here won't obfuscate the real directory path.
    const realDir = path.resolve(dir, '..', await realpath(dir))

    // Skip caching linked modules because it's highly likely that the developer wants to debug that module.
    if (!realDir.startsWith(root)) return

    this.cacheModuleQueue = this.cacheModuleQueue.then(
      this.spawnCacheModule({ name, version, entry }, {
        dir,
        enableEnvify: browserify && browserify.transform && browserify.transform.includes('loose-envify')
      })
    )
    await this.cacheModuleQueue
  }

  async spawnCacheModule({ name, version, entry }, { dir, enableEnvify }) {
    const { cacheModuleIds, cacheDest, mangleExcept, root, transformModuleNames } = this
    if (cacheModuleIds[`${name}/${version}/${entry}`]) return
    cacheModuleIds[`${name}/${version}/${entry}`] = true
    const args = [
      path.join(__dirname, '../bin/compileModule.js'),
      '--name', name,
      '--version', version,
      '--entry', entry,
      '--dest', cacheDest,
      '--paths', dir,
      '--root', root,
      '--source-root', '/'
    ]
    if (mangleExcept.includes(name)) args.push('--mangle')
    if (transformModuleNames.includes(name)) args.push('--transform')
    if (enableEnvify) args.push('--envify')
    await spawn(process.argv[0], args, { stdio: 'inherit' })
  }

  async readModule(id, isMain) {
    const { cache, cacheExcept, root, transformModuleNames } = this
    const [, name, version, entry] = id.match(rModuleId)
    const map = this.findMap({ name, version })

    // It's possible that the id passed to `this.readModule()` isn't valid.
    if (!map) return

    const { dir, browserify } = map
    const fpath = path.join(dir, entry)

    if (!fpath) return
    if (!cacheExcept.includes('*') || cacheExcept.includes(name)) {
      this.cacheModule({ name, version, entry }).catch(err => console.error(err.stack))
    }

    const { code } = await transformScript(id, {
      cache, dir, fpath, root,
      enableEnvify: browserify && browserify.transform && browserify.transform.includes('loose-envify'),
      enableTransform: transformModuleNames.includes(name)
    })
    const stats = await lstat(fpath)
    const dependencies = matchRequire.findAll(code)

    return [define(id.replace(rExt, ''), dependencies, code), {
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
    else if (await this.isSource(id)) {
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
   * Compile component as a spare component or a bundle containing dependencies.
   * @param {string}    entry
   * @param {Object}    opts
   * @param {string}   [opts.factory]              Factory code of the entry component.
   * @param {string}   [opts.includeComponents]    Whether or not to include relative components.
   * @param {string}   [opts.includeLoader]        Whether or not to include loader itself.
   * @param {boolean}  [opts.includeModules=false]  Whether or not to include external modules.
   * @param {string}   [opts.sourceRoot]
   * @returns {Object} { js, map, wildModules }
   * @example
   * compileComponent('home', { includeLoader: true, includeModules: true })
   */
  async compileComponent(entry, opts) {
    await this.parsePromise
    opts = {
      includeLoader: false,
      includeModules: false,
      includeComponents: true,
      loaderConfig: this.loaderConfig,
      save: true,
      ...opts
    }
    const { dest, paths, root, system, tree } = this
    const { includeLoader, includeModules, includeComponents, loaderConfig, sourceRoot } = opts

    const fpath = opts.factory ? null : (await findScript(entry, paths))[0]
    const { name, version } = system
    const id = `${name}/${version}/${entry}`
    const treeBranch = {}

    let result = await bundleScript({ name, version, entry }, {
      root, paths,
      enableEnvify: true, enableTransform: true, enableAbsoluteId: true, enableBundle: includeComponents,
      dependencies: opts.dependencies,
      factory: opts.factory,
      toplevel: includeLoader ? (await this.parseLoader()) : null
    })
    let { sourceMaps, toplevel, wildModules } = result

    if (includeModules && wildModules.length > 0) {
      result = await this.bundleModules(wildModules, { toplevel, treeBranch })
      toplevel = result.toplevel
      if (result.sourceMaps) sourceMaps.push(...result.sourceMaps)
    }

    if (includeLoader) {
      // If not all modules are included, use the whole tree instead of the tree branch generated while bundling.
      toplevel = UglifyJS.parse(`
porter.config(${JSON.stringify({ ...loaderConfig, ...this.flatTree(includeModules ? treeBranch : tree) })})
porter["import"](${JSON.stringify(id)})
`, { filename: fpath ? path.relative(root, fpath) : `${entry}.js`, toplevel })
    }
    const { js, map } = minifyScript(id, toplevel, { sourceMaps, sourceRoot })
    if (opts.save) await compileScript(id, { dest, js, map })
    return { js, map, wildModules }
  }

  async bundleModules(wildModules, opts) {
    const { root, system } = this
    const sourceMaps = []

    let toplevel = opts.toplevel
    let mod
    while ((mod = wildModules.shift())) {
      const { name, entry } = mod
      const route = mod.route || [system.name, name]
      const { browserify, dir, version, main } = routeMap(route, this.tree, opts.treeBranch)
      const enableTransform = this.transformModuleNames.includes(name)
      const result = await bundleScript({ name, version, entry: entry || main }, {
        root, paths: dir,
        enableEnvify: browserify && browserify.transform && browserify.transform.includes('loose-envify'),
        enableTransform, toplevel
      })
      for (const m of result.wildModules) m.route = [...route, m.name]
      wildModules.push(...result.wildModules)
      if (enableTransform) sourceMaps.push(result.sourceMap)
      toplevel = result.toplevel
    }

    return { sourceMaps, toplevel }
  }

  /**
   * @param {Object}   mod
   * @param {string}   mod.name
   * @param {string}   mod.version
   * @param {string}   mod.entry
   * @param {Object}   opts
   * @param {string}   opts.paths       Path of the module, e.g. node_modules/jquery
   * @param {boolean} [opts.save=true]  Whether or not to save result to files
   * @param {string}  [opts.sourceRoot]
   * @return {Object} { js, map, wildModules }
   */
  async compileModule({ name, version, entry }, opts) {
    await this.parsePromise
    opts = { save: true, ...opts }
    const { dest, root } = this
    const { paths } = opts

    if (!paths) throw new Error(`Please provide paths of module '${name}/${version}'`)
    const { toplevel, sourceMaps, wildModules } = await bundleScript({ name, version, entry }, {
      root, paths,
      enableEnvify: opts.enableEnvify,
      enableTransform: opts.enableTransform
    })
    const id = `${name}/${version}/${entry}`
    const result = minifyScript(id, toplevel, {
      sourceMaps, sourceRoot: opts.sourceRoot,
      mangle: opts.mangle
    })

    if (opts.save) await compileScript(id, { dest, ...result })
    return { wildModules, ...result }
  }

  /**
   * Compile all components and modules within the root directory into dest folder.
   * @param {Object}                  opts
   * @param {string|string[]|RegExp} [opts.match]              The match pattern to find entry components to compile
   * @param {string|string[]|RegExp} [opts.spareMatch]         The match pattern to find spare components to compile
   * @param {string}                 [opts.sourceRoot]         The source root
   * @example
   * compileAll({ match: 'pages/*', spareMatch: 'frames/*' })
   */
  async compileAll(opts = {}) {
    if (!opts.match) {
      throw new Error('Please specify entry components with opts.match')
    }
    await this.parsePromise
    const { sourceRoot } = opts
    const { paths, system, loaderConfig, transformModuleNames } = this
    const matchFn = makeMatchFn(opts.match)
    const spareMatchFn = makeMatchFn(opts.spareMatch)
    const isPreloadFn = makeMatchFn([].concat(loaderConfig.preload))
    const doneIds = {}
    const wildModules = []
    let queueModule

    const queuePossibleComponent = async mod => {
      // #38 cyclic dependencies between components and modules
      const id = mod.entry ? `${mod.name}/${mod.entry}` : mod.name
      if (await this.isComponent(id)) {
        await queueModule({ name: system.name, version: system.version, entry: id })
      } else {
        console.warn(`WARN unmet dependency ${id}`)
      }
    }

    queueModule = async mod => {
      if (mod.name === system.name) {
        mod.version = system.version
      } else {
        if (!mod.route) mod.route = [system.name, mod.name]
        const map = routeMap(mod.route, this.tree)
        if (!map) return await queuePossibleComponent(mod)
        const { version, main } = map
        if (!mod.version) mod.version = version
        if (!mod.entry) mod.entry = main
      }
      if (!doneIds[`${mod.name}/${mod.version}/${mod.entry}`]) {
        wildModules.push(mod)
      }
    }

    for (const currentPath of paths) {
      const entries = await glob('{*.js,!(node_modules)/**/*.js}', { cwd: currentPath })

      for (const entryPath of entries) {
        const entry = entryPath.replace(rExt, '')
        const isMainEntry = matchFn(entryPath)
        const isSpareEntry = isPreloadFn(entry) || spareMatchFn(entryPath)
        if (isMainEntry || isSpareEntry) {
          const result = await this.compileComponent(entry, {
            includeLoader: isMainEntry,
            includeComponents: isMainEntry,
            sourceRoot
          })
          doneIds[`${system.name}/${system.version}/${entry}`] = true
          for (const mod of result.wildModules) await queueModule(mod)
        }
      }
    }

    let mod
    while ((mod = wildModules.shift())) {
      if (doneIds[`${mod.name}/${mod.version}/${mod.entry}`]) continue
      if (mod.name === system.name) {
        const result = await this.compileComponent(mod.entry, {
          includeComponents: false, sourceRoot
        })
        for (const child of result.wildModules) await queueModule(child)
      } else {
        const route = mod.route || [system.name, mod.name]
        const { version, main, alias, browserify, dir } = routeMap(route, this.tree)
        if (!mod.version) mod.version = version
        if (!mod.entry) mod.entry = main
        if (alias && alias[mod.entry]) mod.entry = alias[mod.entry]
        const result = await this.compileModule(mod, {
          paths: dir, sourceRoot,
          enableEnvify: browserify && browserify.transform && browserify.transform.includes('loose-envify'),
          enableTransform: transformModuleNames.includes(mod.name)
        })
        for (const child of result.wildModules) {
          child.route = [...mod.route, child.name]
          await queueModule(child)
        }
      }
      doneIds[`${mod.name}/${mod.version}/${mod.entry}`] = true
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
