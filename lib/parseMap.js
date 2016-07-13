'use strict'

/**
 * @module
 */

const path = require('path')
const format = require('util').format
const matchRequire = require('match-require')

const fs = require('./fs')
const glob = require('./glob')

const readFile = fs.readFile
const exists = fs.exists


function* closest(root, name) {
  var fpath = path.join(root, 'node_modules', name)

  if (yield exists(fpath)) {
    return fpath
  } else if (root.indexOf('/node_modules/') > 0) {
    while (path.basename(root) !== 'node_modules') {
      root = path.resolve(root, '..')
    }
    return yield* closest(path.resolve(root, '..'), name)
  } else {
    return ''
  }
}


function* resolveModule(opts) {
  var pkgRoot = opts.pkgRoot || (yield closest(opts.root, opts.name))

  if (!pkgRoot) {
    return { version: opts.version }
  }

  var pkgPath = path.join(pkgRoot, 'package.json')
  var pkg = JSON.parse(yield readFile(pkgPath, 'utf8'))

  var main = typeof pkg.browser === 'string'
    ? pkg.browser
    : pkg.main || 'index.js'

  var dependencies = {}

  function* resolveDependency(entry, context) {
    var fpath = path.join(context, entry.replace(/(?:\.js)?$/, '.js'))
    var content = yield readFile(fpath, 'utf8')
    var deps = matchRequire.findAll(content)

    for (var i = 0, len = deps.length; i < len; i++) {
      let name = deps[i]

      if (name.charAt(0) === '.') {
        yield* resolveDependency(name, path.dirname(fpath))
      }
      else if (name in pkg.dependencies || name in pkg.devDependencies) {
        dependencies[name] = yield* resolveModule({
          root: pkgRoot,
          name: name
        })
      }
      else {
        unmetDependency(name, pkg.name)
      }
    }
  }

  yield* resolveDependency(main, pkgRoot)

  return {
    dir: pkgRoot,
    dependencies: dependencies,
    main: main,
    version: pkg.version
  }
}


/**
 * Find the path of a component in mutiple base directories
 *
 * @param {string} id
 * @param {Array}  bases
 * @yield {string} path of the component found
 */
function* findComponent(id, bases) {
  for (let i = 0; i < bases.length; i++) {
    let componentPath = path.join(bases[i], id)
    if (yield exists(componentPath)) {
      return componentPath
    }
  }
}


/**
 * Warn about unmet dependency
 *
 * @param  {string} name      name of the dependency
 * @param  {string} dependent name of the dependent
 */
function unmetDependency(name, dependent) {
  console.warn(format('Unmet dependency %s required by %s',
    name, dependent)
  )
}


/**
 * Calculate the aliases of modules required by components.
 *
 * @param {Object}    opts
 * @param {string}   [opts.root=process.cwd()] Current working directory
 * @param {string}   [opts.base=components]    Components directory
 * @param {encoding} [opts.encoding=utf8]     Encoding of the components
 *
 * @returns {DependenciesMap}
 *
 * Something like:
 *
 * ```
 * {
 *   "yen": {
 *     "version": "1.2.1"
 *   },
 *   "ez-editor": {
 *     "version": "0.2.2",
 *     "dependencies": {
 *       "extend-object": {
 *         "main": "./extend-object.js",
 *         "version": "1.0.0"
 *       },
 *       "inherits": {
 *         "main": "./inherits_browser",
 *         "version": "2.0.1"
 *       }
 *     }
 *   }
 * }
 * ```
 */
function* parseMap(opts) {
  opts = opts || {}
  var root = opts.root || process.cwd()
  var encoding = opts.encoding || 'utf8'
  var pkg = require(path.relative(__dirname, path.join(root, 'package.json')))
  var paths = [].concat(opts.paths || 'components').map(function(dir) {
    return path.resolve(root, dir)
  })
  var currentPath
  var dependencies = {}

  function* parseComponent(fpath) {
    var code = yield readFile(fpath, encoding)
    var id = path.relative(currentPath, fpath).replace(/\.js$/, '')

    return {
      id: id,
      dependencies: matchRequire.findAll(code)
    }
  }

  function* resolveComponent(result, meta) {
    for (var i = 0, len = meta.dependencies.length; i < len; i++) {
      var name = meta.dependencies[i]

      // required by relative path. must be a component rather than node_module.
      if (name.charAt(0) === '.' || name in result) continue

      // exists in components dir.
      if (yield* findComponent(name + '.js', paths)) continue

      // local module
      if (name === pkg.name) continue

      var version = (pkg.dependencies && pkg.dependencies[name]) ||
        (pkg.devDependencies && pkg.devDependencies[name])

      // specified in package.json.
      if (version) {
        result[name] = yield* resolveModule({ name: name, root: root})
      } else {
        unmetDependency(name, meta.id)
      }
    }

    return result
  }

  for (var i = 0; i < paths.length; i++) {
    currentPath = paths[i]
    /**
     * glob all components within current path. js files within node_modules
     * shall be ignored because a component shall never reside in that.
     * paths like foo/node_modules cannot be ruled out by current approach.
     */
    const pattern = path.join(currentPath, '!(node_modules)/**/*.js')
    const entries = yield glob(pattern, { cwd: currentPath })
    const components = yield entries.map(parseComponent)

    if (opts.serveSelf) {
      dependencies[pkg.name] = yield* resolveModule({
        name: pkg.name,
        pkgRoot: root
      })
    }

    for (var j = 0, len = components.length; j < len; j++) {
      yield* resolveComponent(dependencies, components[j])
    }
  }

  return dependencies
}


module.exports = parseMap
