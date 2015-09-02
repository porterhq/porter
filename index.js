'use strict'

var path = require('path')
var fs = require('fs')
var co = require('co')
var crypto = require('crypto')
var semver = require('semver')
var mkdirp = require('mkdirp')
var matchRequire = require('match-require')

var postcss = require('postcss')
var autoprefixer = require('autoprefixer-core')

var parseMap = require('./lib/parseMap')
var parseSystem = require('./lib/parseSystem')
var define = require('./lib/define')
var compileAll = require('./lib/compileAll')
var compileStyleSheets = require('./lib/compileStyleSheets')

var loader = fs.readFileSync(path.join(__dirname, 'import.js'))

var RE_EXT = /(\.(?:css|js))$/
var RE_MAIN = /^(?:main|runner)\b/


function exists(fpath) {
  return new Promise(function(resolve) {
    fs.exists(fpath, resolve)
  })
}

function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(err)
      else resolve(content)
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

function readdir(dir) {
  return new Promise(function(resolve, reject) {
    fs.readdir(dir, function(err, entries) {
      if (err) reject(err)
      else resolve(entries)
    })
  })
}

function mkdirpAsync(dir, opts) {
  return new Promise(function(resolve, reject) {
    mkdirp(dir, opts || {}, function(err, made) {
      if (err) reject(err)
      else resolve(made)
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
  var dest = path.resolve(cwd, opts.dest || 'public')

  var dependenciesMap
  var system

  var parseSystemPromise = co(function* () {
    dependenciesMap = yield parseMap(opts)
    system = parseSystem(dependenciesMap)
  })

  var cacheModulePromise = Promise.resolve()
  var cacheModuleList = []


  function cacheModule(mod) {
    var blacklist = opts.cacheExcept

    // module is being cached already
    if (cacheModuleList.indexOf(mod.name + '/' + mod.version) >= 0) {
      return
    }

    // opst.cacheExcept would be something like `['yen']`
    if (Array.isArray(blacklist) && blacklist.indexOf(mod.name) >= 0) {
      return
    }

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
          dest: dest
        }).catch(function(err) {
          console.error(err.stack)
        })
      })

      cacheModuleList.push(mod.name + '/' + mod.version)
    }
  }

  function* readModule(id, main) {
    var mod = parseId(id, system)
    var fpath

    if (mod.name in system.modules) {
      fpath = findModule(mod, dependenciesMap)
      if (opts.cache) cacheModule(mod)
    }
    else {
      fpath = path.join(base, mod.name)
    }

    if (yield exists(fpath)) {
      var factory = yield readFile(fpath, encoding)
      var content = define(
        id.replace(RE_EXT, ''), matchRequire.findAll(factory), factory
      )

      if (main) {
        content = [
          loader,
          define('system', [], 'module.exports = ' + JSON.stringify(system)),
          content
        ].join('\n')
      }

      return content
    }
  }

  function sendModuleExpress(req, res, next) {
    function main() {
      var id = req.path.slice(1)

      return co(readModule(id, RE_MAIN.test(id) || 'main' in req.query))
        .then(function(content) {
          if (!content) return next()
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/javascript')
          res.write(content, encoding)
          res.end()
        })
    }

    if (system) {
      main().catch(next)
    } else {
      parseSystemPromise.then(main).catch(next)
    }
  }

  function* sendModule(ctx, next) {
    if (!system) yield parseSystemPromise

    var id = ctx.path.slice(1)
    var main = RE_MAIN.test(id) || 'main' in ctx.query
    var content = yield* readModule(id, main)

    if (content) {
      ctx.status = 200
      ctx.type = 'application/javascript'
      ctx.body = content
    }
    else {
      yield next
    }
  }


  function* readCache(id, source) {
    var md5 = crypto.createHash('md5')
    md5.update(source)
    var checksum = md5.digest('hex')
    var cacheName = id.replace(RE_EXT, '-' + checksum + '$1')
    var fpath = path.join(cwd, 'tmp', cacheName)

    if (yield exists(fpath)) {
      return yield readFile(fpath, encoding)
    }
  }

  function* writeCache(id, source, content) {
    var md5 = crypto.createHash('md5')
    md5.update(source)
    var cacheId = id.replace(RE_EXT, '-' + md5.digest('hex') + '$1')
    var fpath = path.join(cwd, 'tmp', cacheId)

    yield mkdirpAsync(path.dirname(fpath))
    yield writeFile(fpath, content)
    co(clearCache(id, cacheId))
  }

  function* clearCache(id, cacheId) {
    var fname = path.basename(id)
    var cacheName = path.basename(cacheId)
    var dir = path.join(cwd, 'tmp', path.dirname(id))
    var entries = yield readdir(dir)

    for (var i = 0, len = entries.length; i < len; i++) {
      var entry = entries[i]
      if (entry !== cacheName &&
          entry.replace(/-[0-9a-f]{32}(\.(?:js|css))$/, '$1') === fname) {
        fs.unlink(path.join(dir, entry))
      }
    }
  }


  function* readStyle(id) {
    var fpath = path.join(base, id)
    var destPath = path.join(dest, id)

    if (!(yield exists(fpath))) {
      fpath = path.join(cwd, 'node_modules', id)
      if (!(yield exists(fpath))) return
    }

    var source = yield readFile(fpath)
    var cache = yield* readCache(id, source)

    if (cache) return cache

    var result = yield postcss()
      .use(autoprefixer())
      .process(source, {
        from: path.relative(cwd, fpath),
        to: path.relative(cwd, destPath),
        map: { inline: false }
      })

    yield* writeCache(id, source, result.css)
    yield mkdirpAsync(path.dirname(destPath))
    yield writeFile(destPath + '.map', result.map)

    return result.css
  }

  function* sendStyle(ctx, next) {
    var id = ctx.path.slice(1)
    var content = yield* readStyle(id)

    if (content) {
      ctx.status = 200
      ctx.type = 'text/css'
      ctx.body = content
    }
    else {
      yield next
    }
  }

  function sendStyleExpress(req, res, next) {
    var id = req.path.slice(1)

    co(readStyle(id)).then(function(content) {
      if (content) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/css')
        res.write(content)
        res.end()
      }
      else {
        next()
      }
    }).catch(next)
  }


  if (opts.express) {
    return function(req, res, next) {
      switch (path.extname(req.path)) {
        case '.js':
          sendModuleExpress(req, res, next)
          break
        case '.css':
          sendStyleExpress(req, res, next)
          break
        default:
          next()
      }
    }
  }
  else {
    return function* (next) {
      switch (path.extname(this.path)) {
        case '.js':
          yield* sendModule(this, next)
          break
        case '.css':
          yield* sendStyle(this, next)
          break
        default:
          yield next
      }
    }
  }
}


oceanify.parseMap = parseMap
oceanify.compileAll = compileAll.compileAll
oceanify.compileComponent = compileAll.compileComponent
oceanify.compileModule = compileAll.compileModule
oceanify.compileStyleSheets = compileStyleSheets

// Expose oceanify
module.exports = oceanify
