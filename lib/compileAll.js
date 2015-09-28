'use strict'

/**
 * @module
 */
var path = require('path')
var glob = require('glob')
var util = require('util')
var debug = require('debug')('oceanify')
var mkdirp = require('mkdirp')
var fs = require('fs')
var UglifyJS = require('uglify-js')
var semver = require('semver')
var objectAssign = require('object-assign')

var parseMap = require('./parseMap')
var parseSystem = require('./parseSystem')
var define = require('./define')
var findComponent = require('./findComponent')

var deheredoc = require('./deheredoc')
var matchRequire = require('match-require')


function globAsync(pattern) {
  return new Promise(function(resolve, reject) {
    glob(pattern, function(err, entries) {
      if (err) reject(err)
      else resolve(entries)
    })
  })
}

function mkdirpAsync(dir) {
  return new Promise(function(resolve, reject) {
    mkdirp(dir, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function writeFile(fpath, content) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(fpath, content, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(new Error(err.message))
      else resolve(content)
    })
  })
}


/**
 * The module id might be something like:
 *
 * - `ink/0.2.0/index`
 * - `ink/0.2.0/lib/display_object`
 * - `@org/name/0.1.0/index`
 *
 * Use this method to remove the version part out of it.
 *
 * @param {string} id
 *
 * @returns {string} id with version stripped
 */
function stripVersion(id) {
  var parts = id.split('/')

  for (var i = parts.length - 1; i >= 0; i--) {
    if (semver.valid(parts[i])) {
      parts.splice(i, 1)
      break
    }
  }

  return parts.join('/')
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
 * @param  {Array}  route           The route of the dependency
 * @param  {Object} dependenciesMap The map of the dependencies tree
 *
 * @returns {Object} An object that contains information about the dependency
 */
function findModule(route, dependenciesMap, requiredMap) {
  route = [].concat(route)
  var result = null

  while (!result && route.length) {
    result = route.reduce(function(obj, p) {
      return obj.dependencies[p]
    }, { dependencies: dependenciesMap })

    if (result && requiredMap) {
      let name = route[0]
      requiredMap[name] = JSON.parse(JSON.stringify(dependenciesMap[name]))
    }

    route.splice(-2, 1)
  }

  return result
}


/**
 * Bundle a component or module, with its relative dependencies included by
 * default. And if passed opts.dependenciesMap, include all the dependencies.
 *
 * When bundling all the dependencies, _bundle will be called recursively.
 * The call stack might be something like:
 *
 *     _bundle('main', {
 *       root: root,
 *       bases: path.join(root, 'components'),
 *       dependenciesMap: dependenciesMap,
 *       toplevel: yield* parseLoader(dependenciesMap)
 *     })
 *
 *     // found out that the dependencies of main are ['ez-editor', './lib/foo']
 *     // `./lib/foo` can be appended directly but `ez-editor` needs _bundle
 *     _bundle('ez-editor/0.2.4/index', {
 *       root: root,
 *       bases: path.join(root, 'node_modules'),
 *       dependenciesMap: dependenciesMap,
 *       toplevel: toplevel,   // current toplevel ast,
 *       ids: ['main', 'lib/foo'],
 *       routes: ['ez-editor']
 *     })
 *
 *     // found out that the dependencies of ez-editor are ['yen'] and so on.
 *     _bundle('yen/1.2.4/index', {
 *       root: path.join(root, 'node_modules/ez-editor'),
 *       bases: path.join(root, 'node_modules/ez-editor/node_modules'),
 *       dependenciesMap: dependenciesMap,
 *       toplevel: toplevel,
 *       ids: ['main', 'lib/foo', 'ez-editor/0.2.4/index'],
 *       routes: ['ez-editor', 'yen']
 *     })
 *
 * @param {string}   main
 * @param {Object}   opts
 * @param {string}   opts.root                  the source root
 * @param {string}   opts.bases                 the bases of current module
 * @param {object}  [opts.dependenciesMap=null]
 * @param {object}  [opts.requiredMap=null]
 * @param {boolean} [opts.includeModules]       include dependencies in node_modules
 * @param {object}  [opts.toplevel=null]        the toplevel ast that contains all the parsed code
 * @param {array}   [opts.ids=[]]               the ids of the modules that are bundled already
 * @param {array}   [opts.route=[]]             the dependency route if called recursively
 *
 * @yield {Object} An ast that contains main, relative modules, And
 *   if passed opts.dependenciesMap, all the dependencies.
 */
function* _bundle(main, opts) {
  var root = opts.root
  var bases = [].concat(opts.bases)
  var toplevel = opts.toplevel
  var dependenciesMap = opts.dependenciesMap
  var requiredMap = opts.requiredMap
  var includeModules = opts.includeModules

  var ids = opts.ids || []
  var route = opts.route || []

  function* append(id, dependencies, factory) {
    if (ids.indexOf(id) >= 0) return
    ids.unshift(id)

    var sourceId = stripVersion(id)
    var fpath = yield findComponent(sourceId + '.js', bases)

    if (!fpath && !factory) {
      throw new Error(util.format('Cannot find source of %s in %s', id, bases))
    }

    factory = factory || (yield readFile(fpath, 'utf-8'))
    dependencies = dependencies || matchRequire.findAll(factory)

    for (var i = dependencies.length - 1; i >= 0; i--) {
      if (/heredoc$/.test(dependencies[i])) {
        dependencies.splice(i, 1)
      }
    }

    fpath = fpath || path.join(bases[0], sourceId + '.js')
    toplevel = UglifyJS.parse(define(id, dependencies, factory), {
      filename: path.relative(root, fpath),
      toplevel: toplevel
    })

    yield* satisfy({ id: id, dependencies: dependencies })
  }

  function* satisfy(component) {
    for (var i = 0, len = component.dependencies.length; i < len; i++) {
      var dep = component.dependencies[i]

      if (dep.charAt(0) === '.') {
        yield* append(path.join(path.dirname(component.id), dep))
      }
      else if (yield findComponent(dep + '.js', bases)) {
        yield* append(dep)
      }
      else if (dependenciesMap && includeModules) {
        route.push(dep)
        yield* appendModule(dep)
        route.pop()
      }
    }
  }

  function* appendModule(name) {
    var data = findModule(route, dependenciesMap, requiredMap)
    var id = path.join(name, data.version, data.main.replace(/\.js$/, ''))
    var pkgBase = name.split('/').reduce(function(result) {
      return path.resolve(result, '..')
    }, data.dir)

    yield* _bundle(id, {
      root: root,
      bases: pkgBase,
      dependenciesMap: dependenciesMap,
      requiredMap: requiredMap,
      includeModules: includeModules,
      route: route,
      toplevel: toplevel,
      ids: ids
    })
  }

  yield* append(main, opts.dependencies, opts.factory)

  return toplevel
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
 * @param    {Object}  sourceOptions          Source map options
 * @param    {string} [sourceOptions.root=''] Source root
 */
function _process(id, ast, sourceOptions) {
  /* eslint-disable camelcase */
  sourceOptions = objectAssign({
    root: ''
  }, sourceOptions || {})
  var compressor = new UglifyJS.Compressor()

  deheredoc(ast)
  ast.figure_out_scope()

  var compressed = ast.transform(compressor)

  compressed.figure_out_scope()
  compressed.compute_char_frequency()
  compressed.mangle_names()

  var sourceMap = new UglifyJS.SourceMap({
    file: id + '.js',
    root: sourceOptions.root
  })
  var stream = new UglifyJS.OutputStream({
    ascii_only: true,
    source_map: sourceMap
  })

  compressed.print(stream)

  return {
    js: stream.toString(),
    map: sourceMap.toString()
  }
  /* eslint-enable camelcase */
}


/**
 * @param {string}
 * @param {Object}
 */
function* _compileFile(id, opts) {
  var dest = opts.dest
  var assetPath = path.join(dest, id + '.js')

  yield mkdirpAsync(path.dirname(assetPath))
  yield [
    writeFile(assetPath, opts.js + '\n//# sourceMappingURL=./' + path.basename(id) + '.js.map'),
    writeFile(assetPath + '.map', opts.map)
  ]

  debug('compiled %s', id)
}


/*
 * Compile all modules under base into target folder.
 *
 * Example:
 *
 *   compileAll({ base: './components', match: 'main/*' })
 *
 * @param {Object}        opts
 * @param {string|Array} [opts.base=components]          The base directory to find the sources
 * @param {string}       [opts.dest=public]              The destintation directory
 * @param {string}       [opts.match={main,main\/**\/*}] The match pattern to find the components to compile
 * @param {string}       [opts.root=process.cwd()]       Current working directory
 */
function* compileAll(opts) {
  opts = opts || {}
  var root = opts.root || process.cwd()
  var dest = path.resolve(root, opts.dest || 'public')
  var match = opts.match || '**/main.js'
  var sourceOptions = opts.sourceOptions
  var bases = [].concat(opts.base || 'components').map(function(base) {
    return path.resolve(root, base)
  })

  var dependenciesMap = yield* parseMap({ root: root, base: bases, dest: dest })
  var compiled = {}

  function* walk(deps) {
    for (var name in deps) {
      var mod = deps[name]
      var versions = compiled[name] || (compiled[name] = {})
      var main = (mod.main || 'index').replace(/\.js$/, '')

      if (versions[mod.version]) continue

      yield* compileModule(path.join(name, mod.version, main), {
        root: root,
        base: path.resolve(mod.dir, '..'),
        dest: dest,
        sourceOptions: sourceOptions
      })

      yield* walk(mod.dependencies)
    }
  }

  yield* walk(dependenciesMap)

  for (let i = 0; i < bases.length; i++) {
    let base = bases[i]
    let entries = yield globAsync(path.join(base, match))

    if (!entries.length) {
      console.error('Found no entries that macth %s in %s', match, base)
    }

    for (let j = 0, len = entries.length; j < len; j++) {
      let id = path.relative(base, entries[j]).replace(/\.js$/, '')

      yield* compileComponent(id, {
        root: root,
        base: bases,
        dest: dest,
        dependenciesMap: dependenciesMap,
        includeModules: false,
        sourceOptions: sourceOptions
      })
    }
  }
}


/**
 * @yield {Object} Parsed ast of import.js
 */
function* parseLoader() {
  var loader = yield readFile(path.join(__dirname, '../import.js'), 'utf-8')

  return UglifyJS.parse(loader, {
    filename: 'import.js'
  })
}


/**
 * @typedef  {CompileResult}
 * @type     {Object}
 * @property {string} js  The compiled javascript
 * @property {string} map The source map of the compiled javascript
 */

/**
 * @param {string}          id
 * @param {Object}          opts
 * @param {DependenciesMap} opts.dependenciesMap
 * @param {string}         [opts.dest]
 * @param {string|Array}   [opts.base=components]
 * @param {boolean}        [opts.includeModules]       Whethor to include node_modules or not
 * @param {Array}          [opts.dependencies]         Dependencies of the entry module
 * @param {string}         [opts.factory]              Factory code of the entry module
 * @param {string}         [opts.root=process.cwd()]
 *
 * @returns {CompileResult}
 */
function* compileComponent(id, opts) {
  opts = objectAssign({
    root: process.cwd(),
    base: 'components',
    includeModules: true
  }, opts)

  var root = opts.root
  var bases = [].concat(opts.base).map(function(base) {
    return path.resolve(root, base)
  })
  var dependenciesMap = opts.dependenciesMap
  var includeModules = opts.includeModules

  var requiredMap = {}
  var toplevel = yield* parseLoader()
  var bundleOpts = {
    root: root,
    bases: bases,
    dependencies: opts.dependencies,
    factory: opts.factory,
    includeModules: includeModules,
    dependenciesMap: dependenciesMap,
    requiredMap: requiredMap,
    toplevel: toplevel
  }

  toplevel = yield* _bundle(id, bundleOpts)

  // If not all modules are included, use the full dependencies map instead
  // of the required map generated white bundling.
  var map = includeModules ? requiredMap : dependenciesMap

  toplevel = yield* _bundle('system', objectAssign(bundleOpts, {
    dependencies: [],
    factory: 'module.exports = ' + JSON.stringify(parseSystem(map))
  }))

  var entry = 'oceanify(' + JSON.stringify(id.replace(/\.js$/, '')) + ')'
  toplevel = UglifyJS.parse(entry, {
    toplevel: toplevel
  })

  var dest = opts.dest && path.resolve(root, opts.dest)
  var result = _process(id, toplevel, opts.sourceOptions)

  if (dest) {
    yield* _compileFile(id, {
      dest: dest,
      js: result.js,
      map: result.map
    })
  }

  return result
}


/**
 * @param {string}  id
 * @param {Object}  opts
 * @param {string} [opts.dest]                  If passed, will write .js and .map files
 * @param {string} [opts.base=node_modules]
 * @param {Object} [opts.dependenciesMap=null]  If passed, will include all the dependencies
 * @param {string} [opts.root=process.cwd()]
 *
 * @returns {CompileResult}
 */
function* compileModule(id, opts) {
  var root = opts.root || process.cwd()
  var base = path.resolve(root, opts.base || 'node_modules')

  var toplevel = yield* _bundle(id, {
    root: root,
    bases: base,
    dependenciesMap: opts.dependenciesMap,
    includeModules: !!opts.dependenciesMap
  })

  var dest = opts.dest && path.resolve(root, opts.dest)
  var result = _process(id, toplevel, opts.sourceOptions)

  if (dest) {
    yield* _compileFile(id, {
      dest: dest,
      js: result.js,
      map: result.map
    })
  }

  return result
}


exports.compileAll = compileAll
exports.compileModule = compileModule
exports.compileComponent = compileComponent
