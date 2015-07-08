'use strict'

var fs = require('fs')
var glob = require('glob').sync
var path = require('path')
var format = require('util').format

var parse = require('./parse')

var readFile = fs.readFileSync
var exists = fs.existsSync


function closest(cwd, name) {
  var fpath = path.join(cwd, 'node_modules', name)

  if (exists(fpath)) {
    return fpath
  } else if (cwd.indexOf('/node_modules/') > 0) {
    return closest(path.resolve(cwd, '../..'), name)
  } else {
    return ''
  }
}


function resolveModule(opts) {
  var pkgRoot = closest(opts.cwd, opts.name)

  if (!pkgRoot) {
    return { version: opts.version }
  }

  var pkg = JSON.parse(readFile(path.join(pkgRoot, 'package.json'), 'utf-8'))

  var bowerPath = path.join(pkgRoot, 'bower.json')
  if (exists(bowerPath)) {
    pkg = JSON.parse(readFile(bowerPath, 'utf-8'))
  }

  var main = typeof pkg.browser === 'string'
    ? pkg.browser
    : pkg.main || 'index'

  var alias = path.join(pkg.name, pkg.version, main)
    .replace(new RegExp('\\' + path.sep, 'g'), '/')
    .replace(/\.js$/, '')

  var dependencies = {}

  if (pkg.dependencies) {
    Object.keys(pkg.dependencies).forEach(function(dep) {
      dependencies[dep] = resolveModule({
        cwd: pkgRoot,
        name: dep,
        version: pkg.dependencies[dep]
      })
    })
  }

  return {
    alias: alias,
    dependencies: dependencies,
    main: main,
    version: pkg.version
  }
}


function unmetDependency(name, version, list) {
  throw new Error(format('Unmet dependency %s@%s required by %s',
    name, version, list.join('::'))
  )
}


function parseAlias(opts) {
  opts = opts || {}
  var cwd = opts.cwd || process.cwd()
  var base = path.resolve(cwd, opts.base || 'components')
  var encoding = opts.encoding || 'utf-8'
  var pkg = require(path.relative(__dirname, path.join(cwd, 'package.json')))


  function parseComponent(fpath) {
    var code = readFile(fpath, encoding)
    var id = path.relative(base, fpath).replace(/\.js$/, '')

    id = JSON.stringify(id)
    return parse('define(' + id + ', function(require, exports, module) {' + code + '})')
  }

  /*
   * Calculate the aliases of modules required by components. Should return an
   * Object like:
   *
   *     {
   *       "yen": {
   *         "main": "index",
   *         "alias": "yen/1.2.1/index",
   *         "dependencies": {}
   *       },
   *       "ez-editor": {
   *         "main": "index",
   *         "alias": "ez-editor/0.2.2/index",
   *         "dependencies": {
   *           "extend-object": {
   *             "main": "./extend-object.js",
   *             "alias": "extend-object/1.0.0/extend-object",
   *             "dependencies": {}
   *           },
   *           "inherits": {
   *             "main": "./inherits_browser",
   *             "alias": "inherits/2.0.1/inherits_browser",
   *             "dependencies": {}
   *           }
   *         }
   *       }
   *     }
   */
  function resolveComponent(result, meta) {
    for (var i = 0, len = meta.dependencies.length; i < len; i++) {
      var name = meta.dependencies[i]
      var version = pkg.dependencies[name] || pkg.devDependencies[name]

      if (name.charAt(0) === '.' || name in result) continue

      if (version) {
        result[name] = resolveModule({ name: name, cwd: cwd })
      } else {
        unmetDependency(name, version, meta.id)
      }
    }

    return result
  }

  function flatten(dependencies) {
    var result = {}
    var list = []

    function walk(deps) {
      for (var name in deps) {
        if (!pkg.dependencies[name]) {
          unmetDependency(name, deps[name].version, list)
        }
        result[name] = deps[name].alias
        list.push(name)
        walk(deps[name].dependencies)
        list.pop()
      }
    }

    walk(dependencies)
    return result
  }

  function main() {
    var components = glob(path.join(base, '**/*.js')).map(parseComponent)
    var componentsAlias = components.reduce(function(result, meta) {
      // alias components too
      result[meta.id] = meta.id + '-' + meta.digest.slice(0, 8)
      return result
    }, {})

    var dependencies = components.reduce(resolveComponent, {})
    var dependenciesAlias = flatten(dependencies)

    for (var name in dependenciesAlias) {
      componentsAlias[name] = dependenciesAlias[name]
    }

    return componentsAlias
  }

  return main()
}


module.exports = parseAlias
