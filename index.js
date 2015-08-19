'use strict'

var path = require('path')
var fs = require('fs')
var co = require('co')
var semver = require('semver')
var matchRequire = require('match-require')

var parseMap = require('./lib/parseMap')
var flattenMap = require('./lib/flattenMap')
var define = require('./lib/define')
var compileAll = require('./lib/compileAll')

var loader = fs.readFileSync(path.join(__dirname, 'import.js'))


function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(err)
      else resolve(content)
    })
  })
}


/*
 * Find the path of a module in the dependencies map.
 */
function findModule(mod, dependenciesMap) {
  var props = []

  function walk(map) {
    var name = mod.name

    if (name in map && map[name].version === mod.version) {
      return path.join(map[name].dir, mod.entry)
    }

    for (name in map) {
      props.push(name)
      var result = walk(map[name].dependencies)
      if (result) return result
      props.pop()
    }
  }

  return walk(dependenciesMap)
}


function parseId(id, system) {
  var parts = id.split('/')
  var name = parts.shift()

  if (name.charAt(0) === '@') {
    name += '/' + parts.shift()
  }

  if (name in system.modules) {
    var version = semver.valid(parts[0]) ? parts.shift() : ''

    return {
      name: name,
      version: version,
      entry: parts.join('/')
    }
  }
  else {
    return { name: id }
  }
}


/*
 * Factory
 */
function oceanify(opts) {
  opts = opts || {}
  var encoding = 'utf-8'
  var cwd = opts.cwd || process.cwd()
  var base = path.resolve(cwd, opts.base || 'components')

  var dependenciesMap
  var system

  function* parseLocal(result) {
    if (!opts.local) return result

    var content = yield readFile(path.join(cwd, 'package.json'), encoding)
    var pkg = JSON.parse(content)

    result[pkg.name] = {
      dir: cwd,
      version: pkg.version,
      main: pkg.main || 'index'
    }

    return result
  }

  var parseSystemPromise = co(function* () {
    dependenciesMap = yield* parseLocal(yield parseMap(opts))
    system = flattenMap(dependenciesMap)
  })

  var cacheModulePromise = Promise.resolve()
  var cacheModuleList = []

  function cacheModule(mod) {
    if (cacheModuleList.indexOf(mod.name + '/' + mod.version) >= 0) return

    var pkg = system.modules[mod.name][mod.version]
    var main = pkg.main
      ? pkg.main.replace(/^\.\//, '').replace(/\.js$/, '')
      : 'index'

    if (main === mod.entry) {
      var fpath = findModule(mod, dependenciesMap)

      while (!/node_modules$/.test(fpath)) {
        fpath = path.dirname(fpath)
      }

      cacheModulePromise.then(function() {
        return oceanify.compileModule({
          base: fpath,
          name: mod.name,
          main: main,
          version: mod.version,
          dest: opts.dest
        }).catch(function(err) {
          console.error(err.stack)
        })
      })

      cacheModuleList.push(mod.name + '/' + mod.version)
    }
  }


  return function(req, res, next) {
    if (!req.path) {
      Object.defineProperty(req, 'path', {
        get: function() {
          return this.url.split('?')[0]
        }
      })
    }

    if (path.extname(req.path) !== '.js') {
      return next()
    }

    var id = req.path.slice(1).replace(/\.js$/, '')

    function sendComponent(err, factory) {
      if (err) {
        return next(err.code === 'ENOENT' ? null : err)
      }

      var content = define(id, matchRequire.findAll(factory), factory)

      if (/^(?:main|runner)\b/.test(id) || 'import' in req.query) {
        content = [
          loader,
          define('system', [], 'module.exports = ' + JSON.stringify(system)),
          content
        ].join('\n')
      }

      sendContent(content)
    }

    function sendContent(content) {
      if (res.is) {
        res.status = 200
        res.type = 'application/javascript'
        res.body = content
        next()
      }
      else {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/javascript')
        res.write(content, encoding)
        res.end()
      }
    }

    function main() {
      var mod = parseId(id, system)
      var fpath

      if (mod.name in system.modules) {
        fpath = findModule(mod, dependenciesMap)
        cacheModule(mod)
      }
      else {
        fpath = path.join(base, mod.name)
      }

      if (fpath) {
        fs.readFile(fpath + '.js', encoding, sendComponent)
      } else {
        next()
      }
    }

    if (system) {
      main()
    } else {
      parseSystemPromise.then(main, next)
    }
  }
}


oceanify.parseMap = parseMap
oceanify.compileAll = compileAll.compileAll
oceanify.compileComponent = compileAll.compileComponent
oceanify.compileModule = compileAll.compileModule


// Expose oceanify
module.exports = oceanify
