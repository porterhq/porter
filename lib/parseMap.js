'use strict'

/**
 * @module
 */

var fs = require('fs')
var _glob = require('glob')
var path = require('path')
var format = require('util').format
var matchRequire = require('match-require')


function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) {
        reject(new Error(err.message))
      } else {
        resolve(content)
      }
    })
  })
}

function glob(dir) {
  return new Promise(function(resolve, reject) {
    _glob(dir, function(err, entries) {
      if (err) reject(err)
      else resolve(entries)
    })
  })
}

function exists(fpath) {
  return new Promise(function(resolve, reject) {
    fs.exists(fpath, resolve)
  })
}


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
  var pkg = JSON.parse(yield readFile(pkgPath, 'utf-8'))

  var main = typeof pkg.browser === 'string'
    ? pkg.browser
    : pkg.main || 'index.js'

  var dependencies = {}

  function* resolveDependency(entry, context) {
    var fpath = path.join(context, entry.replace(/(?:\.js)?$/, '.js'))
    var content = yield readFile(fpath, 'utf-8')
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
 * @param {encoding} [opts.encoding=utf-8]     Encoding of the components
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
  var base = path.resolve(root, opts.base || 'components')
  var encoding = opts.encoding || 'utf-8'
  var pkg = require(path.relative(__dirname, path.join(root, 'package.json')))

  function* parseComponent(fpath) {
    var code = yield readFile(fpath, encoding)
    var id = path.relative(base, fpath).replace(/\.js$/, '')

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
      if (yield exists(path.join(base, name + '.js'))) continue

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

  var components = yield glob(path.join(base, '**/*.js'))
  components = yield components.map(parseComponent)
  var dependencies = {}

  if (opts.self) {
    dependencies[pkg.name] = yield* resolveModule({
      name: pkg.name,
      pkgRoot: root
    })
  }

  for (var i = 0, len = components.length; i < len; i++) {
    yield* resolveComponent(dependencies, components[i])
  }

  return dependencies
}


module.exports = parseMap
