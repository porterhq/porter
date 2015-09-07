'use strict'

var path = require('path')
var fs = require('fs')
var co = require('co')
var crypto = require('crypto')
var semver = require('semver')
var mkdirp = require('mkdirp')
var matchRequire = require('match-require')

var postcss = require('postcss')
var autoprefixer = require('autoprefixer')

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
      if (err) reject(new Error(err.message))
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

function lstat(fpath) {
  return new Promise(function(resolve, reject) {
    fs.lstat(fpath, function(err, stats) {
      if (err) reject(err)
      else resolve(stats)
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
  var cacheExceptions = opts.cacheExcept || []

  if (typeof cacheExceptions === 'string') {
    cacheExceptions = [cacheExceptions]
  }

  var dependenciesMap
  var system
  var pkg

  var parseSystemPromise = co(function* () {
    dependenciesMap = yield parseMap(opts)
    system = parseSystem(dependenciesMap)
    pkg = JSON.parse(yield readFile(path.join(cwd, 'package.json'), 'utf-8'))
  })

  var cacheModulePromise = Promise.resolve()
  var cacheModuleList = []


  function* cacheModule(mod) {
    if (cacheModuleList.indexOf(mod.name + '/' + mod.version) >= 0 ||
        mod.name === pkg.name ||
        cacheExceptions[0] === '*' ||
        cacheExceptions.indexOf(mod.name) >= 0) {
      return
    }

    var data = system.modules[mod.name][mod.version]
    var main = data.main
      ? data.main.replace(/^\.\//, '').replace(/\.js$/, '')
      : 'index'

    if (main + '.js' === mod.entry) {
      cacheModuleList.push(mod.name + '/' + mod.version)
      var fpath = findModule(mod, dependenciesMap)

      while (fpath && !/node_modules$/.test(fpath)) {
        fpath = path.dirname(fpath)
      }

      if (!fpath) {
        console.error('Failed to find module %s', mod.name)
        return
      }

      var stats = yield lstat(path.join(fpath, mod.name))
      if (stats.isSymbolicLink()) {
        console.log('Ignore symbolic linked module %s', mod.name)
        return
      }

      try {
        yield* oceanify.compileModule({
          base: fpath,
          name: mod.name,
          main: main,
          version: mod.version,
          dest: dest
        })
      }
      catch (err) {
        console.error(err.stack)
      }
    }
  }

  function* readModule(id, main) {
    var mod = parseId(id, system)
    var fpath

    if (mod.name in system.modules) {
      fpath = findModule(mod, dependenciesMap)
      cacheModulePromise = cacheModulePromise.then(function() {
        return co(cacheModule(mod))
      })
    }
    else {
      fpath = path.join(base, mod.name)
    }

    if (!(yield exists(fpath))) return

    var factory = yield readFile(fpath, encoding)
    var stats = yield lstat(fpath)
    var dependencies = matchRequire.findAll(factory)

    var content = (opts.self && !(mod.name in system.modules)
      ? defineComponent
      : define
    )(id.replace(RE_EXT, ''), dependencies, factory)

    if (main) {
      content = [
        loader,
        define('system', [], 'module.exports = ' + JSON.stringify(system)),
        content
      ].join('\n')
    }

    return [content, {
      'Cache-Control': 'must-revalidate',
      'Content-Type': 'application/javascript',
      ETag: crypto.createHash('md5').update(content).digest('hex'),
      'Last-Modified': stats.mtime
    }]
  }

  function defineComponent(id, dependencies, factory) {
    for (let i = 0; i < dependencies.length; i++) {
      let dep = dependencies[i]
      let fpath = path.resolve(base, dep)

      if (dep.indexOf('..') === 0 &&
          fpath.indexOf(base) < 0 &&
          fpath.indexOf(cwd) === 0) {
        let depAlias = fpath.replace(cwd, pkg.name)
        dependencies[i] = depAlias
        factory = matchRequire.replaceAll(factory, function(match, quote, name) {
          return name === dep
            ? ['require(', depAlias, ')'].join(quote)
            : match
        })
      }
    }

    return define(id, dependencies, factory)
  }

  function sendModuleExpress(req, res, next) {
    function main() {
      var id = req.path.slice(1)
      var isMain = RE_MAIN.test(id) || 'main' in req.query

      return co(readModule(id, isMain)).then(function(result) {
        if (!result) return next()
        var content = result[0]
        var headers = result[1]

        res.statusCode = 200
        res.set(headers)

        if (req.fresh) {
          res.statusCode = 304
        } else {
          res.write(content, encoding)
        }

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
    var result = yield* readModule(id, main)

    if (result) {
      ctx.status = 200
      ctx.set(result[1])
      if (ctx.fresh) {
        ctx.status = 304
      } else {
        ctx.body = result[0]
      }
    }
    else {
      yield next
    }
  }


  function* readCache(id, source) {
    var checksum = crypto.createHash('md5').update(source).digest('hex')
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


  var postcssProcessor = postcss().use(autoprefixer())

  function* readStyle(id) {
    var fpath = path.join(base, id)
    var destPath = path.join(dest, id)

    if (!(yield exists(fpath))) {
      fpath = path.join(cwd, 'node_modules', id)
      if (!(yield exists(fpath))) return
    }

    var source = yield readFile(fpath, encoding)
    var cache = yield* readCache(id, source)
    var stats = yield lstat(fpath)
    var content

    if (cache) {
      content = cache
    }
    else {
      let result = yield postcssProcessor.process(source, {
        from: path.relative(cwd, fpath),
        to: path.relative(cwd, destPath),
        map: { inline: false }
      })

      yield* writeCache(id, source, result.css)
      yield mkdirpAsync(path.dirname(destPath))
      yield writeFile(destPath + '.map', result.map)

      content = result.css
    }

    return [content, {
      'Content-Type': 'text/css',
      'Cache-Control': 'must-revalidate',
      ETag: crypto.createHash('md5').update(content).digest('hex'),
      'Last-Modified': stats.mtime
    }]
  }

  function* sendStyle(ctx, next) {
    var id = ctx.path.slice(1)
    var result = yield* readStyle(id)

    if (result) {
      ctx.status = 200
      ctx.set(result[1])
      if (ctx.fresh) {
        ctx.status = 304
      } else {
        ctx.body = result[0]
      }
    }
    else {
      yield next
    }
  }

  function sendStyleExpress(req, res, next) {
    var id = req.path.slice(1)

    co(readStyle(id)).then(function(result) {
      if (result) {
        res.statusCode = 200
        res.set(result[1])
        if (req.fresh) {
          res.statusCode = 304
        } else {
          res.write(result[0])
        }
        res.end()
      }
      else {
        next()
      }
    }).catch(next)
  }


  if (opts.express) {
    return function(req, res, next) {
      if (res.headerSent) return next()

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
      if (this.headerSent) return yield next

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
