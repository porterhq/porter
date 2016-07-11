'use strict'

/**
 * @module
 */

const path = require('path')
const util = require('util')
const debug = require('debug')('oceanify')
const UglifyJS = require('uglify-js')
const semver = require('semver')
const minimatch = require('minimatch')
const matchRequire = require('match-require')

const glob = require('./glob')
const mkdirp = require('./mkdirp')
const fs = require('./fs')
const parseMap = require('./parseMap')
const parseSystem = require('./parseSystem')
const define = require('./define')
const findComponent = require('./findComponent')

const deheredoc = require('./deheredoc')

const readFile = fs.readFile
const writeFile = fs.writeFile



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
  const parts = id.split('/')

  for (let i = parts.length - 1; i >= 0; i--) {
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
 * @param {Array}  route           The route of the dependency
 * @param {Object} dependenciesMap The map of the dependencies tree
 * @param {Object} requriedmap     The map of the dependencies that are actually required
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
 * @param {object}  [opts.dependenciesMap=null] If passed, will bundle dependencies too
 * @param {object}  [opts.requiredMap=null]     If passed, the actual dependencies map will be stored here
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

    factory = factory || (yield readFile(fpath, 'utf8'))
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
      else if (dependenciesMap) {
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
 * @param    {string}  sourceRoot
 */
function _process(id, ast, sourceRoot) {
  /* eslint-disable camelcase */
  var compressor = new UglifyJS.Compressor()

  deheredoc(ast)
  ast.figure_out_scope()

  var compressed = ast.transform(compressor)

  compressed.figure_out_scope()
  compressed.compute_char_frequency()
  compressed.mangle_names()

  var sourceMap = new UglifyJS.SourceMap({
    file: id + '.js',
    root: sourceRoot
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
 * @param {string} id
 * @param {Object} opts
 * @param {string} opts.js   minified javascript
 * @param {string} opts.map  correspondent source map
 * @param {string} opts.dest The folder to store js and map
 */
function* _compileFile(id, opts) {
  var dest = opts.dest
  var assetPath = path.join(dest, id + '.js')

  yield mkdirp(path.dirname(assetPath))
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
 * @param {Object}           opts
 * @param {string|string[]} [opts.base=components]          The base directory to find the sources
 * @param {string}          [opts.dest=public]              The destintation directory
 * @param {string}          [opts.match={**\/main.js}]      The match pattern to find the components to compile
 * @param {string}          [opts.root=process.cwd()]       Current working directory
 * @param {string}          [opts.sourceRoot]               The source root
 */
function* compileAll(opts = {}) {
  const root = opts.root || process.cwd()
  const dest = path.resolve(root, opts.dest || 'public')
  const match = opts.match || '**/main.js'
  const sourceRoot = opts.sourceRoot
  const bases = [].concat(opts.base || 'components').map(function(base) {
    return path.resolve(root, base)
  })

  const dependenciesMap = yield* parseMap({ root: root, base: bases, dest: dest })
  const doneModules = {}

  function* walk(deps) {
    for (const name in deps) {
      const mod = deps[name]
      const doneModule = doneModules[name] || (doneModules[name] = {})
      const main = (mod.main || 'index').replace(/\.js$/, '')
      const pkgBase = name.split('/').reduce(function(result) {
        return path.resolve(result, '..')
      }, mod.dir)

      if (doneModule[mod.version]) continue

      yield* compileModule(path.join(name, mod.version, main), {
        root: root,
        base: pkgBase,
        dest: dest,
        sourceRoot: sourceRoot
      })

      yield* walk(mod.dependencies)
    }
  }

  yield* walk(dependenciesMap)

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i]
    const entries = yield glob(path.join(base, '**/*.js'))

    if (!entries.length) {
      console.error('Found no entries to compile in %s', base)
    }

    for (let j = 0, len = entries.length; j < len; j++) {
      const id = path.relative(base, entries[j]).replace(/\.js$/, '')

      if (minimatch(id + '.js', match)) {
        yield* compileComponent(id, {
          root: root,
          base: bases,
          dest: dest,
          dependenciesMap: dependenciesMap,
          includeModules: false,
          sourceRoot: sourceRoot,
          importConfig: opts.importConfig
        })
      }
      else {
        yield* compileComponentPlain(id, {
          root: root,
          base: bases,
          dest: dest,
          sourceRoot: sourceRoot
        })
      }
    }
  }
}


/**
 * @yield {Object} Parsed ast of import.js
 */
function* parseLoader() {
  var loader = yield readFile(path.join(__dirname, '../import.js'), 'utf8')

  return UglifyJS.parse(loader, {
    filename: 'import.js'
  })
}


/**
 * compile the component alone.
 *
 * @param {string}           id             Component id
 * @param {Object}          [opts]
 * @param {string}          [opts.root]     root directory
 * @param {string|string[]} [opts.base]     base directory
 * @param {string}          [opts.dest]
 *
 * @yield {ProcessResult}
 */
function* compileComponentPlain(id, opts) {
  opts = Object.assign({
    root: process.cwd(),
    base: 'components'
  }, opts)

  var root = opts.root
  var bases = [].concat(opts.base).map(function(base) {
    return path.resolve(root, base)
  })

  var fpath = yield findComponent(id + '.js', bases)
  var content = yield readFile(fpath, 'utf8')

  if (!/^raw\//.test(id)) {
    let dependencies = matchRequire.findAll(content)
    content = define(id, dependencies, content)
  }

  var toplevel = UglifyJS.parse(content, {
    filename: path.relative(root, fpath)
  })

  var result = _process(id, toplevel, opts.sourceRoot)
  var dest = opts.dest && path.resolve(root, opts.dest)

  if (opts.dest) {
    yield* _compileFile(id, {
      dest: dest,
      js: result.js,
      map: result.map
    })
  }

  return result
}


/**
 * @param {string}           id
 * @param {Object}           opts
 * @param {DependenciesMap}  opts.dependenciesMap       Notice the bundling behavior is controlled by opts.includeModules
 * @param {string}          [opts.dest]
 * @param {string|string[]} [opts.base=components]
 * @param {boolean}         [opts.includeModules]       Whethor to include node_modules or not
 * @param {Array}           [opts.dependencies]         Dependencies of the entry module
 * @param {string}          [opts.factory]              Factory code of the entry module
 * @param {string}          [opts.root=process.cwd()]
 * @param {string}          [opts.sourceRoot]
 *
 * @yield {ProcessResult}
 */
function* compileComponent(id, opts) {
  opts = Object.assign({
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

  if (!dependenciesMap) {
    return yield* compileComponentPlain(id, opts)
  }

  var factory = opts.factory

  if (!factory) {
    let fpath = yield findComponent(id + '.js', bases)
    factory = yield readFile(fpath, 'utf8')
  }

  var dependencies = opts.dependencies || matchRequire.findAll(factory)
  var requiredMap = {}
  var toplevel = yield* parseLoader()
  var bundleOpts = {
    root,
    bases,
    dependencies,
    factory,
    toplevel
  }

  if (includeModules) {
    Object.assign(bundleOpts, { dependenciesMap, requiredMap })
  }

  toplevel = yield* _bundle(id, bundleOpts)

  // If not all modules are included, use the full dependencies map instead of
  // the required map generated white bundling.
  var map = includeModules ? requiredMap : dependenciesMap
  var importConfig = Object.assign(opts.importConfig || {}, parseSystem(map))
  var entries = [id.replace(/\.js$/, '')]

  if (yield* findComponent('preload.js', bases)) {
    entries.unshift('preload')
  }

  toplevel = UglifyJS.parse([
    'oceanify.config(' + JSON.stringify(importConfig) + ')',
    'oceanify.import(' + JSON.stringify(entries) + ')'
  ].join('\n'), {
    toplevel: toplevel
  })

  var dest = opts.dest && path.resolve(root, opts.dest)
  var result = _process(id, toplevel, opts.sourceRoot)

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
 * @param {string} [opts.sourceRoot]
 *
 * @yield {ProcessResult}
 */
function* compileModule(id, opts) {
  var root = opts.root || process.cwd()
  var base = path.resolve(root, opts.base || 'node_modules')

  var toplevel = yield* _bundle(id, {
    root: root,
    bases: base,
    dependenciesMap: opts.dependenciesMap
  })

  var dest = opts.dest && path.resolve(root, opts.dest)
  var result = _process(id, toplevel, opts.sourceRoot)

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
