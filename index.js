'use strict'

/**
 * @module
 */

var path = require('path')
var fs = require('fs')
var co = require('co')
var crypto = require('crypto')
var semver = require('semver')
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
var findComponent = require('./lib/findComponent')
var findModule = require('./lib/findModule')
var Cache = require('./lib/Cache')

var loaderPath = path.join(__dirname, 'import.js')
var loader = fs.readFileSync(loaderPath, 'utf8')
var loaderStats = fs.statSync(loaderPath)

var RE_EXT = /(\.(?:css|js))$/i
var RE_MAIN = /\/(?:main|runner)\.js$/
var RE_ASSET_EXT = /\.(?:gif|jpg|jpeg|png|svg|swf|ico)$/i
var RE_RAW = /^raw\//


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
 * Factory
 *
 * @param {Object}           opts
 * @param {string}          [opts.root=process.cwd()] Override current working directory
 * @param {string|string[]} [opts.base=components]    Base directory name or path
 * @param {string}          [opts.dest=public]        Cache destination
 * @param {string|string[]} [opts.cacheExcept=[]]     Cache exceptions
 * @param {boolean}         [opts.self=false]         Include host module itself
 * @param {boolean}         [opts.express=false]      Express middleware
 * @param {boolean}         [opts.serveSource]        Serve sources for devtools
 *
 * @returns {Function|GeneratorFunction} A middleware for Koa or Express
 */
function oceanify(opts) {
  opts = opts || {}
  var encoding = 'utf8'
  var root = opts.root || process.cwd()
  var dest = path.resolve(root, opts.dest || 'public')
  var cacheExceptions = opts.cacheExcept || []
  var serveSource = opts.serveSource
  var importConfig = opts.importConfig || {}
  var bases = [].concat(opts.base || 'components').map(function(dir) {
    return path.resolve(root, dir)
  })

  var cache = new Cache({
    dest: dest,
    encoding: encoding
  })

  if (typeof cacheExceptions === 'string') {
    cacheExceptions = [cacheExceptions]
  }

  if (cacheExceptions.length) debug('Cache exceptions %s', cacheExceptions)
  if (serveSource) debug('Serving source files.')

  var dependenciesMap
  var system
  var pkg

  var parseSystemPromise = co(function* () {
    dependenciesMap = yield* parseMap(opts)
    system = parseSystem(dependenciesMap)
    pkg = JSON.parse(yield readFile(path.join(root, 'package.json'), 'utf8'))
    objectAssign(importConfig, system)
  })

  function mightCacheModule(mod) {
    if (mod.name === pkg.name ||
        cacheExceptions[0] === '*' ||
        cacheExceptions.indexOf(mod.name) >= 0) {
      return
    }

    cache.precompile(mod, {
      dependenciesMap: dependenciesMap,
      system: system
    })
  }

  function* formatMain(id, content) {
    var entries = [id.replace(RE_EXT, '')]

    if (yield findComponent('preload.js', bases)) {
      entries.unshift('preload')
    }

    return [
      loader,
      'oceanify.config(' + JSON.stringify(importConfig) + ')',
      content,
      'oceanify.import(' + JSON.stringify(entries) + ')'
    ].join('\n')
  }

  function* readModule(id, isMain) {
    if (!system) yield parseSystemPromise

    var mod = parseId(id, system)
    var fpath

    if (mod.name in system.modules) {
      fpath = findModule(mod, dependenciesMap)
      mightCacheModule(mod)
    }
    else {
      fpath = yield* findComponent(mod.name, bases)
    }

    if (!fpath) return

    var content = yield readFile(fpath, encoding)
    var stats = yield lstat(fpath)

    if (!RE_RAW.test(id)) {
      let dependencies = matchRequire.findAll(content)
      content = (opts.self && !(mod.name in system.modules)
        ? defineComponent
        : define
      )(id.replace(RE_EXT, ''), dependencies, content)
    }

    if (isMain) {
      content = yield* formatMain(id, content)
    }

    return [content, {
      'Cache-Control': 'max-age=0',
      'Content-Type': 'application/javascript',
      ETag: crypto.createHash('md5').update(content).digest('hex'),
      'Last-Modified': stats.mtime
    }]
  }

  /**
   * process components if opts.self is on
   *
   * @param  {string}   id           component id
   * @param  {string[]} dependencies component dependencies
   * @param  {string}   factory      component factory
   * @return {string}                wrapped component declaration
   */
  function defineComponent(id, dependencies, factory) {
    var base = bases[0]

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


  var postcssProcessor = postcss().use(autoprefixer())

  function* readStyle(id) {
    var fpath = yield* findComponent(id, bases)
    var destPath = path.join(dest, id)

    if (!fpath) {
      fpath = path.join(root, 'node_modules', id)
      if (!(yield exists(fpath))) return
    }

    var source = yield readFile(fpath, encoding)
    var stats = yield lstat(fpath)
    var content = yield* cache.read(id, source)

    if (!content) {
      let result = yield postcssProcessor.process(source, {
        from: path.relative(root, fpath),
        to: path.relative(root, destPath),
        map: { inline: false }
      })

      yield* cache.write(id, source, result.css)
      yield* cache.writeFile(id + '.map', result.map)

      content = result.css
    }

    return [content, {
      'Last-Modified': stats.mtime
    }]
  }


  function isSource(id) {
    var fpath = path.join(root, id)
    return id.indexOf('node_modules') === 0 || bases.some(function(base) {
      return fpath.indexOf(base) === 0
    })
  }


  function* readSource(id) {
    var fpath = path.join(root, id)

    if (yield exists(fpath)) {
      var content = yield readFile(fpath, encoding)
      var stats = lstat(fpath)

      return [content, {
        'Last-Modified': stats.mtime
      }]
    }
  }


  function* readAsset(id, isMain) {
    var ext = path.extname(id)
    var fpath = yield* findComponent(id, bases)
    var result = null

    if (id === 'import.js') {
      result = [loader, {
        'Last-Modified': loaderStats.mtime
      }]
    }
    else if (serveSource && isSource(id)) {
      result = yield* readSource(id)
    }
    else if (ext === '.js') {
      result = yield* readModule(id, isMain)
    }
    else if (ext === '.css') {
      result = yield* readStyle(id, isMain)
    }
    else if (RE_ASSET_EXT.test(ext) && fpath) {
      let content = yield readFile(fpath)
      let stats = yield lstat(fpath)

      result = [content, {
        'Last-Modified': stats.mtime
      }]
    }

    if (result) {
      objectAssign(result[1], {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.lookup(ext) + '; charset=utf8',
        ETag: crypto.createHash('md5').update(result[0]).digest('hex')
      })
    }

    return result
  }


  if (opts.express) {
    return function(req, res, next) {
      if (res.headerSent) return next()

      var id = req.path.slice(1)
      var isMain = RE_MAIN.test(req.path) || 'main' in req.query

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
      var isMain = RE_MAIN.test(this.path) || 'main' in this.query
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
