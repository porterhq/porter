'use strict'

/**
 * @module
 */

const path = require('path')
const co = require('co')
const crypto = require('crypto')
const semver = require('semver')
const matchRequire = require('match-require')
const objectAssign = require('object-assign')
const mime = require('mime')
const debug = require('debug')('oceanify')

const postcss = require('postcss')
const atImport = require('postcss-import')
const autoprefixer = require('autoprefixer')

const fs = require('./lib/fs')
const parseMap = require('./lib/parseMap')
const parseSystem = require('./lib/parseSystem')
const define = require('./lib/define')
const compileAll = require('./lib/compileAll')
const compileStyleSheets = require('./lib/compileStyleSheets')
const findComponent = require('./lib/findComponent')
const findModule = require('./lib/findModule')
const Cache = require('./lib/Cache')

const loaderPath = path.join(__dirname, 'import.js')
const loader = fs.readFileSync(loaderPath, 'utf8')
const loaderStats = fs.statSync(loaderPath)

const RE_EXT = /(\.(?:css|js))$/i
const RE_MAIN = /\/(?:main|runner)\.js$/
const RE_ASSET_EXT = /\.(?:gif|jpg|jpeg|png|svg|swf|ico)$/i
const RE_RAW = /^raw\//

const exists = fs.exists
const readFile = fs.readFile
const lstat = fs.lstat


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
  const parts = id.split('/')
  let name = parts.shift()

  if (name.charAt(0) === '@') {
    name += '/' + parts.shift()
  }

  if (name in system.modules) {
    const version = semver.valid(parts[0]) ? parts.shift() : ''

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
 * @param {boolean}         [opts.cachePersist=false] Don't clear cache every time
 * @param {boolean}         [opts.self=false]         Include host module itself
 * @param {boolean}         [opts.express=false]      Express middleware
 * @param {boolean}         [opts.serveSource=false]  Serve sources for devtools
 * @param {boolean}         [opts.preload=true]       Append preload module
 *
 * @returns {Function|GeneratorFunction} A middleware for Koa or Express
 */
function oceanify(opts) {
  opts = opts || {}
  const encoding = 'utf8'
  const root = opts.root || process.cwd()
  const dest = path.resolve(root, opts.dest || 'public')
  const cacheExceptions = typeof opts.cacheExcept === 'string'
    ? [opts.cacheExcept]
    : opts.cacheExcept || []
  const serveSource = opts.serveSource
  const preload = typeof opts.preload === 'boolean' ? opts.preload : true
  const importConfig = opts.importConfig || {}
  const bases = [].concat(opts.base || 'components').map(function(dir) {
    return path.resolve(root, dir)
  })

  const cache = new Cache({
    dest: dest,
    encoding: encoding
  })

  if (!opts.cachePersist) {
    co(cache.removeAll()).then(function() {
      debug('Cache %s cleared', dest)
    })
  }

  if (cacheExceptions.length) debug('Cache exceptions %s', cacheExceptions)
  if (serveSource) debug('Serving source files.')

  let dependenciesMap
  let system
  let pkg

  let parseSystemPromise = co(function* () {
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
    const entries = [id.replace(RE_EXT, '')]

    if (preload && (yield findComponent('preload.js', bases))) {
      entries.unshift('preload')
    }

    return [
      loader,
      'oceanify.config(' + JSON.stringify(importConfig) + ')',
      content,
      'oceanify["import"](' + JSON.stringify(entries) + ')'
    ].join('\n')
  }

  function* readModule(id, isMain) {
    if (!system) yield parseSystemPromise

    const mod = parseId(id, system)
    let fpath

    if (mod.name in system.modules) {
      fpath = findModule(mod, dependenciesMap)
      mightCacheModule(mod)
    }
    else {
      fpath = yield* findComponent(mod.name, bases)
    }

    if (!fpath) return

    let content = yield readFile(fpath, encoding)
    const stats = yield lstat(fpath)

    if (!RE_RAW.test(id)) {
      const dependencies = matchRequire.findAll(content)
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
    const base = bases[0]

    for (let i = 0; i < dependencies.length; i++) {
      const dep = dependencies[i]
      const fpath = path.resolve(base, dep)

      if (dep.indexOf('..') === 0 &&
          fpath.indexOf(base) < 0 &&
          fpath.indexOf(root) === 0) {
        const depAlias = fpath.replace(root, pkg.name)
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


  /**
   * parse possible import bases from the entry point of the require
   *
   * @param   {string} fpath
   * @returns {Array}
   */
  function parseImportBases(fpath) {
    const importBases = [ path.join(root, 'node_modules') ]
    let dir = path.dirname(fpath)

    while (dir.includes('node_modules')) {
      const parentFolder = path.basename(path.dirname(dir))
      if (parentFolder === 'node_modules' || parentFolder.charAt(0) === '@') {
        importBases.unshift(path.join(dir, 'node_modules'))
      }
      dir = path.resolve(dir, '..')
    }

    return importBases
  }

  function* readStyle(id) {
    const destPath = path.join(dest, id)
    let fpath = yield* findComponent(id, bases)

    if (!fpath) {
      fpath = path.join(root, 'node_modules', id)
      if (!(yield exists(fpath))) return
    }

    const source = yield readFile(fpath, encoding)
    const stats = yield lstat(fpath)
    let content = yield* cache.read(id, source)

    if (!content) {
      const result = yield postcss()
        .use(atImport({ path: parseImportBases(fpath) }))
        .use(autoprefixer())
        .process(source, {
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
    const fpath = path.join(root, id)
    return id.indexOf('node_modules') === 0 || bases.some(function(base) {
      return fpath.indexOf(base) === 0
    })
  }


  function* readSource(id) {
    const fpath = path.join(root, id)

    if (yield exists(fpath)) {
      const content = yield readFile(fpath, encoding)
      const stats = lstat(fpath)

      return [content, {
        'Last-Modified': stats.mtime
      }]
    }
  }


  function* readAsset(id, isMain) {
    const ext = path.extname(id)
    const fpath = yield* findComponent(id, bases)
    let result = null

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
      const content = yield readFile(fpath)
      const stats = yield lstat(fpath)

      result = [content, {
        'Last-Modified': stats.mtime
      }]
    }

    if (result) {
      objectAssign(result[1], {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.lookup(ext),
        ETag: crypto.createHash('md5').update(result[0]).digest('hex')
      })
    }

    return result
  }


  if (opts.express) {
    return function(req, res, next) {
      if (res.headerSent) return next()

      const id = req.path.slice(1)
      const isMain = RE_MAIN.test(req.path) || 'main' in req.query

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

      const id = this.path.slice(1)
      const isMain = RE_MAIN.test(this.path) || 'main' in this.query
      const result = yield* readAsset(id, isMain)

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
