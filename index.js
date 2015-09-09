'use strict'

/**
 * @module
 */

var path = require('path')
var fs = require('fs')
var co = require('co')
var crypto = require('crypto')
var semver = require('semver')
var mkdirp = require('mkdirp')
var matchRequire = require('match-require')
var objectAssign = require('object-assign')
var mime = require('mime')
var debug = require('debug')('oceanify')

var postcss = require('postcss')
var autoprefixer = require('autoprefixer')

var parseMap = require('./lib/parseMap')
var parseSystem = require('./lib/parseSystem')
var define = require('./lib/define')
var compileAll = require('./lib/compileAll')
var compileStyleSheets = require('./lib/compileStyleSheets')

var loaderPath = path.join(__dirname, 'import.js')
var loader = fs.readFileSync(loaderPath, 'utf-8')
var loaderStats = fs.statSync(loaderPath)

var RE_EXT = /(\.(?:css|js))$/i
var RE_MAIN = /^(?:main|runner)\b/
var RE_ASSET_EXT = /\.(?:gif|jpg|jpeg|png|svg|swf)$/i


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


/**
 * @typedef  {Module}
 * @type     {Object}
 * @property {string} name
 * @property {string} version
 * @property {string} entry
 *
 * @typedef  {DependenciesMap}
 * @type     {Object}
 *
 * @typedef  {System}
 * @type     {Object}
 * @property {Object} dependencies
 * @property {Object} modules
 *
 * @typedef  {uAST}
 * @type     {Object}
 */

/**
 * @param  {string} id
 * @param  {Object} system
 *
 * @returns {Module}  mod
 */
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


/**
 * Find the path of a module in the dependencies map.
 *
 * @param {Module} mod
 * @param {DependenciesMap} dependenciesMap
 *
 * @returns {string} fpath     The path to the specified module
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


/**
 * Factory
 *
 * @param {Object}        opts
 * @param {string}       [opts.root=process.cwd()] Override current working directory
 * @param {string}       [opts.base=components]   Base directory name or path
 * @param {string}       [opts.dest=public]       Cache destination
 * @param {string|Array} [opts.cacheExcept=[]]    Cache exceptions
 * @param {boolean}      [opts.self=false]        Include host module itself
 * @param {boolean}      [opts.express=false]     Express middleware
 *
 * @returns {Function|GeneratorFunction} A middleware for Koa or Express
 */
function oceanify(opts) {
  opts = opts || {}
  var encoding = 'utf-8'
  var root = opts.root || process.cwd()
  var base = path.resolve(root, opts.base || 'components')
  var dest = path.resolve(root, opts.dest || 'public')
  var cacheExceptions = opts.cacheExcept || []

  if (typeof cacheExceptions === 'string') {
    cacheExceptions = [cacheExceptions]
  }

  var dependenciesMap
  var system
  var pkg

  var parseSystemPromise = co(function* () {
    dependenciesMap = yield* parseMap(opts)
    system = parseSystem(dependenciesMap)
    pkg = JSON.parse(yield readFile(path.join(root, 'package.json'), 'utf-8'))
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
        debug('Ignored symbolic linked module %s', mod.name)
        return
      }

      try {
        yield* oceanify.compileModule(path.join(mod.name, mod.version, main), {
          base: fpath,
          dest: dest
        })
      }
      catch (err) {
        console.error(err.stack)
      }
    }
  }

  function* readModule(id, main) {
    if (!system) yield parseSystemPromise

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
          fpath.indexOf(root) === 0) {
        let depAlias = fpath.replace(root, pkg.name)
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

  function* readCache(id, source) {
    var checksum = crypto.createHash('md5').update(source).digest('hex')
    var cacheName = id.replace(RE_EXT, '-' + checksum + '$1')
    var fpath = path.join(root, 'tmp', cacheName)

    if (yield exists(fpath)) {
      return yield readFile(fpath, encoding)
    }
  }

  function* writeCache(id, source, content) {
    var md5 = crypto.createHash('md5')
    md5.update(source)
    var cacheId = id.replace(RE_EXT, '-' + md5.digest('hex') + '$1')
    var fpath = path.join(root, 'tmp', cacheId)

    yield mkdirpAsync(path.dirname(fpath))
    yield writeFile(fpath, content)
    co(clearCache(id, cacheId))
  }

  function* clearCache(id, cacheId) {
    var fname = path.basename(id)
    var cacheName = path.basename(cacheId)
    var dir = path.join(root, 'tmp', path.dirname(id))
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
      fpath = path.join(root, 'node_modules', id)
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
        from: path.relative(root, fpath),
        to: path.relative(root, destPath),
        map: { inline: false }
      })

      yield* writeCache(id, source, result.css)
      yield mkdirpAsync(path.dirname(destPath))
      yield writeFile(destPath + '.map', result.map)

      content = result.css
    }

    return [content, {
      'Last-Modified': stats.mtime
    }]
  }


  function* readAsset(id, isMain) {
    var ext = path.extname(id)
    var fpath = path.join(base, id)
    var result = null

    if (id === 'import.js') {
      result = [loader, {
        'Last-Modified': loaderStats.mtime
      }]
    }
    else if (ext === '.js') {
      result = yield* readModule(id, isMain)
    }
    else if (ext === '.css') {
      result = yield* readStyle(id, isMain)
    }
    else if (RE_ASSET_EXT.test(ext) && (yield exists(fpath))) {
      let content = yield readFile(fpath, encoding)
      let stats = yield lstat(fpath)

      result = [content, {
        'Last-Modified': stats.mtime
      }]
    }

    if (result) {
      objectAssign(result[1], {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.lookup(ext) + '; charset=utf-8',
        ETag: crypto.createHash('md5').update(result[0]).digest('hex')
      })
    }

    return result
  }


  if (opts.express) {
    return function(req, res, next) {
      if (res.headerSent) return next()

      var id = req.path.slice(1)
      var isMain = RE_MAIN.test(id) || 'main' in req.query

      co(readAsset(id, isMain)).then(function(result) {
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
  }
  else {
    return function* (next) {
      if (this.headerSent) return yield next

      var id = this.path.slice(1)
      var isMain = RE_MAIN.test(id) || 'main' in this.query
      var result = yield* readAsset(id, isMain)

      if (result) {
        this.status = 200
        this.set(result[1])
        if (this.fresh) {
          this.status = 304
        } else {
          this.body = result[0]
        }
      }
      else {
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


module.exports = oceanify
