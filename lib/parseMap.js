'use strict'

var co = require('co')
var fs = require('fs')
var _glob = require('glob')
var path = require('path')
var format = require('util').format
var matchRequire = require('match-require')


function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) {
        reject(err)
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


function* closest(cwd, name) {
  var fpath = path.join(cwd, 'node_modules', name)

  if (yield exists(fpath)) {
    return fpath
  } else if (cwd.indexOf('/node_modules/') > 0) {
    while (path.basename(cwd) !== 'node_modules') {
      cwd = path.resolve(cwd, '..')
    }
    return yield* closest(path.resolve(cwd, '..'), name)
  } else {
    return ''
  }
}


function ignoreDependencies(name) {
  switch (name) {
    case 'crox':
      return true
  }
}


function* resolveModule(opts) {
  var pkgRoot = yield closest(opts.cwd, opts.name)

  if (!pkgRoot) {
    return { version: opts.version }
  }

  var pkgPath = path.join(pkgRoot, 'package.json')
  var pkg = JSON.parse(yield readFile(pkgPath, 'utf-8'))

  var bowerPath = path.join(pkgRoot, 'bower.json')
  if (yield exists(bowerPath)) {
    pkg = JSON.parse(yield readFile(bowerPath, 'utf-8'))
  }

  var main = typeof pkg.browser === 'string'
    ? pkg.browser
    : pkg.main

  /*
   * As stated in bower.json specification, main might be array.
   *
   * References:
   * - http://bower.io/docs/creating-packages/#main
   * - https://github.com/nnnick/Chart.js/blob/master/bower.json
   */
  if (Array.isArray(main)) {
    main.some(function(entry) {
      if (path.extname(entry) === '.js') {
        main = entry
        return true
      }
    })
  }

  var dependencies = {}

  if (pkg.dependencies && !ignoreDependencies(pkg.name)) {
    for (var dep in pkg.dependencies) {
      dependencies[dep] = yield* resolveModule({
        cwd: pkgRoot,
        name: dep,
        version: pkg.dependencies[dep]
      })
    }
  }

  return {
    dir: pkgRoot,
    dependencies: dependencies,
    main: main,
    version: pkg.version
  }
}


function unmetDependency(name, version, list) {
  console.warn(format('Unmet dependency %s@%s required by %s',
    name, version, list)
  )
}


function parseMap(opts) {
  opts = opts || {}
  var cwd = opts.cwd || process.cwd()
  var base = path.resolve(cwd, opts.base || 'components')
  var encoding = opts.encoding || 'utf-8'
  var pkg = require(path.relative(__dirname, path.join(cwd, 'package.json')))

  function* parseComponent(fpath) {
    var code = yield readFile(fpath, encoding)
    var id = path.relative(base, fpath).replace(/\.js$/, '')

    return {
      id: id,
      dependencies: matchRequire.findAll(code)
    }
  }

  /*
   * Calculate the aliases of modules required by components. Should return an
   * Object like:
   *
   *     {
   *       "yen": {
   *         "version": "1.2.1"
   *       },
   *       "ez-editor": {
   *         "version": "0.2.2",
   *         "dependencies": {
   *           "extend-object": {
   *             "main": "./extend-object.js",
   *             "version": "1.0.0"
   *           },
   *           "inherits": {
   *             "main": "./inherits_browser",
   *             "version": "2.0.1"
   *           }
   *         }
   *       }
   *     }
   */
  function* resolveComponent(result, meta) {
    for (var i = 0, len = meta.dependencies.length; i < len; i++) {
      var name = meta.dependencies[i]

      // required by relative path. must be a component rather than node_module.
      if (name.charAt(0) === '.' || name in result) continue

      // exists in components dir.
      if (yield exists(path.join(base, name + '.js'))) continue

      var version = (pkg.dependencies && pkg.dependencies[name]) ||
        (pkg.devDependencies && pkg.devDependencies[name])

      // specified in package.json.
      if (version) {
        result[name] = yield* resolveModule({ name: name, cwd: cwd })
      } else {
        unmetDependency(name, version, meta.id)
      }
    }

    return result
  }

  return co(function* main() {
    var components = yield glob(path.join(base, '**/*.js'))
    components = yield components.map(parseComponent)
    var dependencies = {}

    for (var i = 0, len = components.length; i < len; i++) {
      yield* resolveComponent(dependencies, components[i])
    }

    return dependencies
  })
}


module.exports = parseMap
