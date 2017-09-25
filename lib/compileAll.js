'use strict'

/**
 * @module
 */

const path = require('path')
const util = require('util')
const debug = require('debug')('oceanify')
const UglifyJS = require('uglify-js')
const minimatch = require('minimatch')
const babel = require('babel-core')

const matchRequire = require('./matchRequire')
const glob = require('./glob')
const mkdirp = require('./mkdirp')
const parseId = require('./parseId')
const parseMap = require('./parseMap')
const parseSystem = require('./parseSystem')
const define = require('./define')
const findComponent = require('./findComponent')
const findModule = require('./findModule')
const deheredoc = require('./deheredoc')

const { readFile, writeFile } = require('mz/fs')

const RE_EXT = /\.js$/
const RE_NAME_ENTRY = /^((?:@[^\/]+\/)?[^\/]+)(?:\/(.*))?$/
const RE_URI = /^(?:https?:)?\/\//


/**
 * Copy map data referenced in route from dependencies map to required map,
 * which will later be used as a slimmer version of dependencies map.
 *
 * @param {Object} requiredMap     A slimmer version of dependencies map
 * @param {Object} dependenciesMap The dependencies map of the app
 * @param {Array}  route           The route of the module required
 */
function mergeMap(requiredMap, dependenciesMap, route) {
  const [appName, depName] = route
  const app = dependenciesMap[appName]

  if (!requiredMap[appName]) {
    requiredMap[appName] = {
      version: app.version,
      main: app.main,
      dependencies: {}
    }
  }

  requiredMap[appName].dependencies[depName] = JSON.parse(JSON.stringify(
    app.dependencies[depName]
  ))
}


/**
 * Find module by route in the dependencies map.
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
 * @param {Object} dependenciesMap The map of the dependencies tree
 * @param {Object} requriedmap     The map of the dependencies that are actually required
 *
 * @returns {Object} An object that contains information about the dependency
 */
function findModuleByRoute(route, dependenciesMap, requiredMap) {
  route = [].concat(route)
  let result = null

  while (!result && route.length >= 2) {
    result = route.reduce(function(obj, p) {
      return obj.dependencies[p]
    }, { dependencies: dependenciesMap })

    if (!result) {
      // ['app', 'ez-editor', 'yen']
      // ['app', 'yen']
      route.splice(-2, 1)
    }
  }

  // If a slimmer map is requested, merge required info to requiredMap.
  if (result && requiredMap) mergeMap(requiredMap, dependenciesMap, route)
  return result
}


/**
 * Bundle a component or module, with its relative dependencies included by
 * default. And if passed opts.dependenciesMap, include all the dependencies.
 *
 * When bundling all the dependencies, _bundle will be called recursively.
 * The call stack might be something like:
 *
 *     _bundle('@my/app/0.0.1/index', {
 *       root,
 *       paths: [
 *         path.join(root, 'components'),
 *         path.join(otherRoot, 'components')
 *       ],
 *       dependenciesMap,
 *       toplevel: yield* parseLoader(dependenciesMap)
 *     })
 *
 *     // found out that the dependencies of main are ['ez-editor', './lib/foo']
 *     // `./lib/foo` can be appended directly but `ez-editor` needs _bundle
 *     _bundle('ez-editor/0.2.4/index', {
 *       root,
 *       paths: path.join(root, 'node_modules'),
 *       dependenciesMap,
 *       toplevel,   // current toplevel ast,
 *       ids: ['main', 'lib/foo'],
 *       routes: ['ez-editor']
 *     })
 *
 *     // found out that the dependencies of ez-editor are ['yen'] and so on.
 *     _bundle('yen/1.2.4/index', {
 *       root: path.join(root, 'node_modules/ez-editor'),
 *       paths: path.join(root, 'node_modules/ez-editor/node_modules'),
 *       dependenciesMap,
 *       toplevel,
 *       ids: ['main', 'lib/foo', 'ez-editor/0.2.4/index'],
 *       routes: ['ez-editor', 'yen']
 *     })
 *
 * @param {string}   main
 * @param {Object}   opts
 * @param {string}   opts.paths                 The components load paths
 * @param {string}   opts.root                  The source root
 * @param {Object}  [opts.dependenciesMap=null] If passed, will bundle dependencies too
 * @param {Array}   [opts.ids=[]]               The ids of the modules that are bundled already
 * @param {boolean} [opts.includesComponents=false] If true, components will be bundled
 * @param {boolean} [opts.includeModules=false] If true, all dependencies will be bundled
 * @param {Object}  [opts.requiredMap=null]     If passed, the actual dependencies map will be stored here
 * @param {Array}   [opts.route=[]]             The dependency route if called recursively
 * @param {Oject}  [opts.toplevel=null]        The toplevel ast that contains all the parsed code
 *
 * @yield {Object} An ast that contains main and relative modules. If
 *   opts.includeModules is true, all the dependencies will be included.
 */
function* _bundle(main, opts) {
  opts = Object.assign({
    moduleIds: {},
    moduleRoute: []
  }, opts)
  const paths = [].concat(opts.paths)
  const isBundlingComponent = !paths[0].endsWith('node_modules')
  const { root, includeModules, includeComponents, dependenciesMap, requiredMap } = opts
  const { moduleIds, moduleRoute } = opts
  const componentIds = {}
  let toplevel = opts.toplevel

  function* append(id, dependencies, factory) {
    if (componentIds[id]) return
    componentIds[id] = true
    if (isBundlingComponent && id != main && !includeComponents) return

    const mod = parseId(id)
    let [fpath, aliased] = isBundlingComponent
      ? yield findComponent(`${mod.entry}.js`, paths)
      : yield findComponent(`${mod.name}/${mod.entry}.js`, paths)

    if (aliased) {
      mod.entry += '/index'
      id += '/index'
    }

    if (!fpath && !factory) {
      throw new Error(util.format('Cannot find source of %s in %s', id, paths))
    }

    factory = factory || (yield readFile(fpath, 'utf8'))
    dependencies = dependencies || matchRequire.findAll(factory)

    for (var i = dependencies.length - 1; i >= 0; i--) {
      if (dependencies[i].endsWith('heredoc')) {
        dependencies.splice(i, 1)
      }
    }

    let result = { code: factory, map: null }
    if (babel && isBundlingComponent) {
      result = babel.transform(factory, {
        filename: `${id}.js`,
        filenameRelative: fpath ? path.relative(root, fpath) : id,
        sourceFileName: fpath ? path.relative(root, fpath) : id,
        sourceMap: false,
        ast: false
      })
    }

    try {
      toplevel = UglifyJS.parse(define(id, dependencies, result.code), {
        // fpath might be undefined because we allow virtual components.
        filename: fpath ? path.relative(root, fpath) : mod.entry,
        toplevel
      })
    } catch (err) {
      throw new Error(`${err.message} (${err.filename}:${err.line}:${err.col})`)
    }

    yield* satisfy(Object.assign(mod, { id, dependencies }))
  }

  function* satisfy(mod) {
    for (const dep of mod.dependencies) {
      if (RE_URI.test(dep)) continue

      if (dep.charAt(0) === '.') {
        yield* append(path.join(path.dirname(mod.id), dep))
        continue
      }

      if (isBundlingComponent) {
        const [fpath, aliased] = yield findComponent(`${dep}.js`, paths)
        if (fpath) {
          yield* append([mod.name, mod.version, aliased ? `${dep}/index` : dep].join('/'))
          continue
        }
      }

      if (dependenciesMap) {
        if (moduleRoute.length == 0) moduleRoute.push(Object.keys(dependenciesMap).pop())
        yield* appendModule(dep)
      }
    }
  }

  function* appendModule(dep) {
    const [, name, entry] = dep.match(RE_NAME_ENTRY)
    moduleRoute.push(name)
    const data = findModuleByRoute(moduleRoute, dependenciesMap, requiredMap)

    if (!data) {
      console.warn(`Cannot find module ${dep}`, main, moduleRoute)
      moduleRoute.pop()
      return
    }

    const realEntry = entry || data.main.replace(RE_EXT, '')
    const id = path.join(name, data.version, realEntry)

    if (includeModules && !moduleIds[id]) {
      const pkgBase = name.split('/').reduce(function(result) {
        return path.resolve(result, '..')
      }, data.dir)

      const result = yield* _bundle(id, {
        root, paths: pkgBase,
        includeModules, dependenciesMap, requiredMap,
        moduleRoute, moduleIds,
        toplevel
      })
      toplevel = result.toplevel
    }

    moduleIds[id] = true
    moduleRoute.pop()
  }

  yield* append(main, opts.dependencies, opts.factory)
  return { toplevel, moduleIds, componentIds }
}


/**
 * @typedef  {ProcessResult}
 * @type     {Object}
 * @property {string} js  Compiled javascript
 * @property {string} map Source map of the compiled javascript
 *
 * @returns  {ProcessResult}
 */

/**
 * Process ast into compiled js and source map
 *
 * @param    {string}  id
 * @param    {uAST}    ast
 * @param    {Object}  opts
 */
function _process(id, ast, opts) {
  const { mangle, sourceMap } = Object.assign({
    mangle: true,
    sourceMap: {}
  }, opts)
  /* eslint-disable camelcase */
  const compressor = new UglifyJS.Compressor({
    screw_ie8: false,
    dead_code: true,
    global_defs: {
      process: {
        env: { NODE_ENV: process.env.NODE_ENV }
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
    file: id + '.js',
    orig: sourceMap.orig,
    root: sourceMap.root
  })
  const stream = new UglifyJS.OutputStream({
    ascii_only: true,
    screw_ie8: false,
    source_map: outSourceMap
  })

  compressed.print(stream)

  return {
    js: stream.toString(),
    map: JSON.stringify(JSON.parse(outSourceMap.toString()), function(k, v) {
      if (k != 'sourcesContent') return v
    })
  }
  /* eslint-enable camelcase */
}


/**
 * @param {string} id
 * @param {Object} opts
 * @param {string} opts.js   minified javascript
 * @param {string} opts.map  correspondent source map
 * @param {string} opts.dest The folder to store js and map
 */
function* _compileFile(id, { dest, js, map }) {
  const assetPath = path.join(dest, `${id}.js`)

  yield mkdirp(path.dirname(assetPath))
  yield [
    writeFile(assetPath, `${js}
//# sourceMappingURL=./${path.basename(id)}.js.map
`),
    writeFile(`${assetPath}.map`, map)
  ]

  debug('compiled %s', id)
}


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
 * Compile all components and modules within the root directory into dest folder.
 *
 * Example:
 *
 *   compileAll({ paths: './components', match: 'main/*' })
 *
 * @param {Object}               opts
 * @param {string}              [opts.dest=public]        The destintation directory
 * @param {string|Array|RegExp} [opts.match]              The match pattern to find entry components to compile
 * @param {string|Array|RegExp} [opts.spareMatch]         The match pattern to find spare components to compile
 * @param {string|string[]}     [opts.paths=components]   The base directory to find the sources
 * @param {string}              [opts.root=process.cwd()] Current working directory
 * @param {string}              [opts.sourceRoot]         The source root
 */
function* compileAll(opts = {}) {
  const root = opts.root || process.cwd()
  const dest = path.resolve(root, opts.dest || 'public')
  const { sourceRoot } = opts
  const loaderConfig = opts.loaderConfig || {}
  const paths = [].concat(opts.paths || 'components').map(function(dir) {
    return path.resolve(root, dir)
  })

  if (!opts.match) {
    throw new Error('Please specify entry components with opts.match')
  }

  const matchFn = makeMatchFn(opts.match)
  const spareMatchFn = makeMatchFn(opts.spareMatch)
  const needsPreload = makeMatchFn([].concat(loaderConfig.preload))

  const dependenciesMap = yield* parseMap({ root, paths })
  const appName = Object.keys(dependenciesMap).pop()
  const appVersion = dependenciesMap[appName].version
  const doneModuleIds = {}
  let wildModuleIds = {}

  function* compileComponentWithoutBundling(id) {
    const mod = parseId(id)
    const { moduleIds, componentIds } = yield* compileComponent(mod.entry, {
      root, paths, dest,
      dependenciesMap, includeModules: false, includeComponents: false,
      sourceRoot
    })
    doneModuleIds[id] = true
    Object.assign(wildModuleIds, moduleIds, componentIds)
  }

  function* compileComponentWithBundling(id) {
    const mod = parseId(id)
    const { moduleIds } = yield* compileComponent(mod.entry, {
      root, paths, dest,
      dependenciesMap, includeLoader: true, includeModules: false,
      sourceRoot,
      loaderConfig
    })
    doneModuleIds[id] = true
    Object.assign(wildModuleIds, moduleIds)
  }

  function* compileModuleWithoutBundling(id) {
    const mod = parseId(id)
    const data = findModule(mod, dependenciesMap)
    const pkgBase = mod.name.split('/').reduce(function(result) {
      return path.resolve(result, '..')
    }, data.dir)

    const { moduleIds } = yield* compileModule(id, {
      root, paths: pkgBase, dest,
      dependenciesMap,
      moduleRoute: [...data.names, mod.name],
      sourceRoot
    })
    doneModuleIds[id] = true
    Object.assign(wildModuleIds, moduleIds)
  }

  for (const currentPath of paths) {
    const entries = yield glob('{*.js,!(node_modules)/**/*.js}', { cwd: currentPath })

    for (const entryPath of entries) {
      const entry = entryPath.replace(RE_EXT, '')
      const id = [appName, appVersion, entry].join('/')

      if (matchFn(entryPath)) {
        yield* compileComponentWithBundling(id)
      }
      else if (needsPreload(entry) || spareMatchFn(entryPath)) {
        yield* compileComponentWithoutBundling(id)
      }
    }
  }

  while (Object.keys(wildModuleIds).length > 0) {
    for (const id in wildModuleIds) {
      if (doneModuleIds[id]) continue
      const mod = parseId(id)

      if (mod.name in dependenciesMap) {
        yield* compileComponentWithoutBundling(id)
      } else {
        yield* compileModuleWithoutBundling(id)
      }
    }

    wildModuleIds = Object.keys(wildModuleIds).reduce(function(result, id) {
      if (!doneModuleIds[id]) result[id] = false
      return result
    }, {})
  }
}


/**
 * @yield {Object} Parsed ast of loader.js
 */
function* parseLoader() {
  const loader = yield readFile(path.join(__dirname, '../loader.js'), 'utf8')

  return UglifyJS.parse(loader, {
    filename: 'loader.js'
  })
}


/**
 * @param {string}           entry
 * @param {Object}           opts
 * @param {DependenciesMap}  opts.dependenciesMap       Notice the bundling behavior is controlled by opts.includeModules
 * @param {Array}           [opts.dependencies]         Dependencies of the entry module
 * @param {string}          [opts.dest]
 * @param {string}          [opts.factory]              Factory code of the entry module
 * @param {boolean}         [opts.includeModules]       Whethor or not to include node_modules
 * @param {string|string[]} [opts.paths=components]
 * @param {string}          [opts.root=process.cwd()]
 * @param {string}          [opts.sourceRoot]
 *
 * @yield {ProcessResult}
 */
function* compileComponent(entry, opts) {
  opts = Object.assign({
    root: process.cwd(),
    paths: 'components',
    loaderConfig: {},
    includeLoader: false,
    includeModules: true,
    includeComponents: true
  }, opts)

  const { root, dependenciesMap, includeLoader, includeModules, includeComponents, loaderConfig } = opts
  const pkg = require(path.join(root, 'package.json'))
  const paths = [].concat(opts.paths).map(function(dir) {
    return path.resolve(root, dir)
  })

  const id = [pkg.name, pkg.version, entry].join('/')
  let factory = opts.factory
  let fpath

  if (!factory) {
    fpath = (yield findComponent(`${entry}.js`, paths))[0]
    factory = yield readFile(fpath, 'utf8')
  }

  let result = { code: factory }
  if (babel) {
    result = babel.transform(factory, {
      filename: `${id}.js`,
      filenameRelative: fpath ? path.relative(root, fpath) : id,
      sourceFileName: fpath ? path.relative(root, fpath) : id,
      sourceMap: true,
      ast: false
    })
  }

  let toplevel = includeLoader ? yield* parseLoader() : null
  const dependencies = opts.dependencies || matchRequire.findAll(result.code)
  const requiredMap = {}

  const bundleResult = yield* _bundle(id, {
    root, paths,
    dependencies, factory: result.code,
    toplevel,
    includeModules, includeComponents, dependenciesMap, requiredMap
  })
  toplevel = bundleResult.toplevel

  if (includeLoader) {
    // If not all modules are included, use the full dependencies map instead of
    // the required map generated while bundling.
    Object.assign(loaderConfig, parseSystem(includeModules ? requiredMap : dependenciesMap))
    toplevel = UglifyJS.parse(`
  oceanify.config(${JSON.stringify(loaderConfig)})
  oceanify.import(${JSON.stringify(id)})
  `, { toplevel })
  }

  const dest = opts.dest && path.resolve(root, opts.dest)
  const { js, map } = _process(id, toplevel, {
    sourceMap: {
      orig: result.map,
      root: opts.sourceRoot
    }
  })

  if (dest) {
    yield* _compileFile(id, { dest, js, map })
  }

  const { moduleIds, componentIds } = bundleResult
  return { js, map, moduleIds, componentIds }
}


/**
 * @param {string}  id
 * @param {Object}  opts
 * @param {Object} [opts.dependenciesMap=null]  If passed, will include all the dependencies
 * @param {string} [opts.dest]                  If passed, will write .js and .map files
 * @param {string} [opts.paths=node_modules]    Actually only the first load path will be used
 * @param {string} [opts.root=process.cwd()]
 * @param {string} [opts.sourceRoot]
 *
 * @yield {ProcessResult}
 */
function* compileModule(id, opts) {
  opts = Object.assign({
    root: process.cwd(),
    paths: 'node_modules'
  }, opts)
  const { root, paths } = opts
  const currentPath = path.resolve(root, Array.isArray(paths) ? paths[0] : paths)

  const { toplevel, moduleIds } = yield* _bundle(id, {
    root, paths: currentPath,
    dependenciesMap: opts.dependenciesMap,
    moduleRoute: opts.moduleRoute
  })

  const dest = opts.dest && path.resolve(root, opts.dest)
  const result = _process(id, toplevel, {
    sourceMap: { root: opts.sourceRoot },
    mangle: opts.mangle
  })

  if (dest) {
    yield* _compileFile(id, {
      dest,
      js: result.js,
      map: result.map
    })
  }

  return Object.assign({ moduleIds, result })
}


exports.compileAll = compileAll
exports.compileModule = compileModule
exports.compileComponent = compileComponent
