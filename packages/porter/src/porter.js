'use strict'

const atImport = require('postcss-import')
const autoprefixer = require('autoprefixer')
const crypto = require('crypto')
const debug = require('debug')('porter')
const fs = require('mz/fs')
const mime = require('mime')
const path = require('path')
const postcss = require('postcss')
const rimraf = require('rimraf')
const { SourceMapGenerator } = require('source-map')
const util = require('util')

const { existsSync } = fs
const { lstat, readFile, writeFile } = fs

const FakePackage = require('./fakePackage')
const Package = require('./package')
const mkdirp = util.promisify(require('mkdirp'))

const rExt = /\.(?:css|gif|jpg|jpeg|js|png|svg|swf|ico)$/i
const { rModuleId } = require('./module')


class Porter {
  constructor(opts) {
    const root = opts.root || process.cwd()
    const paths = [].concat(opts.paths == null ? 'components' : opts.paths).map(loadPath => {
      return path.resolve(root, loadPath)
    })
    const dest = path.resolve(root, opts.dest || 'public')
    const transpile = { only: [], ...opts.transpile }
    const cache = { dest, ...opts.cache }
    const bundle = { except: [], ...opts.bundle }

    Object.assign(this, { root, dest, cache, transpile, bundle })
    const pkg = opts.package || require(path.join(root, 'package.json'))

    transpile.only.push(pkg.name)
    cache.dest = path.resolve(root, cache.dest)

    this.moduleCache = {}
    this.packageCache = {}

    this.package = opts.package
      ? new FakePackage({ dir: root, paths, app: this, package: opts.package, lock: opts.lock })
      : new Package({ dir: root, paths, app: this, package: pkg })

    this.baseUrl = opts.baseUrl || '/'
    this.map = opts.map
    // Ignition timeout
    this.timeout = 30000

    this.entries = [].concat(opts.entries || [])
    this.preload = [].concat(opts.preload || [])
    this.lazyload = [].concat(opts.lazyload || [])

    this.source = { serve: false, root: '/', ...opts.source }
    this.cssLoader = postcss().use(
      atImport({
        path: paths,
        resolve: this.atImportResolve.bind(this)
      })
    )
    this.cssTranspiler = postcss().use(autoprefixer(opts.autoprefixer))
    this.ready = this.prepare(opts)
  }

  async atImportResolve(id, baseDir, importOptions) {
    if (id.startsWith('.')) return path.join(baseDir, id)

    const [fpath] = await this.package.resolve(id)
    if (fpath) return fpath

    const [, name, , file] = id.match(rModuleId)
    if (name in this.package.dependencies) {
      const pkg = this.package.dependencies[name]
      const result = await pkg.resolve(file)
      return result[0]
    } else {
      return id
    }
  }

  readFilePath(fpath) {
    return Promise.all([
      readFile(fpath),
      lstat(fpath).then(stats => ({ 'Last-Modified': stats.mtime.toJSON() }))
    ])
  }

  async readBuiltinJs(name) {
    const fpath = path.join(__dirname, '..', name)
    const result = await this.readFilePath(fpath)

    if (name == 'loader.js') {
      result[0] = await this.package.parseLoader(this.package.loaderConfig)
    }

    return result
  }

  async prepare(opts = {}) {
    const { package: pkg } = this
    const { entries, lazyload, preload } = this

    // enable envify for root package by default
    if (!pkg.browserify) pkg.browserify = { transform: ['envify'] }

    await pkg.prepare()
    await Promise.all([
      ...entries.map(entry => pkg.parseEntry(entry)),
      ...lazyload.map(file => pkg.parseFile(file)),
      ...preload.map(file => pkg.parseFile(file))
    ])

    if (preload.length > 0) {
      const entry = await pkg.parseFile(preload[0])
      entry.isPreload = true
      for (const mod of entry.family) {
        mod.preloaded = true
      }
    }

    const { cache } = this
    await new Promise((resolve, reject) => {
      rimraf(path.join(cache.dest, '**/*.{css,js,map}'), err => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async compilePackages(opts) {
    for (const pkg of this.package.all) {
      if (pkg.parent) {
        await pkg.compileAll(opts)
      }
    }
  }

  async compileExclusivePackages(opts) {
    for (const name of this.bundle.except) {
      const packages = this.package.findAll({ name })
      if (packages.length == 0) throw new Error(`unable to find package ${name}`)
      for (const pkg of packages) await pkg.compileAll(opts)
    }
  }

  async compileAll({ entries, sourceRoot }) {
    debug('init')
    await this.ready

    debug('parse')
    if (entries) {
      await Promise.all(entries.map(entry => this.package.parseEntry(entry)))
    } else {
      entries = Object.keys(this.package.entries)
    }

    debug('minify')
    await Promise.all(Array.from(this.package.all).reduce((tasks, pkg) => {
      tasks.push(...Object.values(pkg.files).map(mod => mod.minify()))
      return tasks
    }, []))

    debug('compile packages')
    if (this.preload.length > 0) {
      await this.compileExclusivePackages({ all: true })
    } else {
      await this.compilePackages()
    }

    debug('compile preload')
    for (const specifier of this.preload) {
      const entry = (await this.package.parseFile(specifier)).file
      await this.package.compile(entry, { all: this.preload.length > 0 })
    }

    debug('compile entries')
    for (const entry of entries) {
      await this.package.compile(entry, { all: this.preload.length > 0 })
    }

    debug('compile lazyload')
    for (const file of this.lazyload) {
      for (const mod of (await this.package.parseFile(file)).family) {
        await mod.package.compile(mod.file, { loader: false, package: false })
      }
    }
    debug('done')
  }

  async compileEntry(entry, opts) {
    return this.package.compile(entry, opts)
  }

  async isRawFile(file) {
    if (!this.source.serve) return false

    if (file.startsWith('node_modules')) {
      const [, name] = file.replace(/^node_modules\//, '').match(rModuleId)
      // #1 cannot require('mocha') just yet
      return this.package.find({ name }) || name == 'mocha'
    }

    const fpath = path.join(this.root, file)
    for (const dir of this.package.paths) {
      if (fpath.startsWith(dir) && existsSync(fpath)) return true
    }

    return false
  }

  async readRawFile(file) {
    const fpath = path.join(this.root, file)

    if (existsSync(fpath)) {
      return this.readFilePath(fpath)
    }
  }

  async parseId(id, { isEntry } = {}) {
    let [, name, version, file] = id.match(rModuleId)

    if (!version) {
      const { package: pkg } = this
      name = pkg.name
      version = pkg.version
      file = id
    }

    const pkg = this.package.find({ name, version })

    if (pkg) {
      if (file in pkg.files) return pkg.files[file]
      const mod = await (isEntry ? pkg.parseEntry(file) : pkg.parseFile(file))
      // make sure the module is accessed with the correct path.
      if (mod && mod.file === file) return mod
    } else {
      return await this.package.parsePackage({ name, entry: file })
    }
  }

  async writeSourceMap({ id, isMain, name, code, map }) {
    const fpath = path.join(this.cache.dest, id)

    if (map instanceof SourceMapGenerator) {
      map = map.toJSON()
    }

    map.sources = map.sources.map(source => source.replace(/^\//, ''))
    const mapPath = isMain ? `${fpath}-main.map` : `${fpath}.map`
    if (id.endsWith('.js')) {
      code += `\n//# sourceMappingURL=${path.basename(mapPath)}`
    }

    await mkdirp(path.dirname(fpath))
    await Promise.all([
      writeFile(fpath, code),
      writeFile(mapPath, JSON.stringify(map, (k, v) => {
        if (k !== 'sourcesContent') return v
      }))
    ])

    return { code }
  }

  async readCss(id, query) {
    const mod = await this.parseId(id, { isEntry: true })
    const { mtime } = await lstat(mod.fpath)
    const result = await mod.obtain()
    const { name } = mod.package
    const { code } = await this.writeSourceMap({ id, name, ...result })

    return [
      code,
      { 'Last-Modified': mtime.toJSON()
    }]
  }

  async readJson(id, query) {
    const mod = await this.parseId(id)
    if (!mod) return
    const { mtime } = await lstat(mod.fpath)
    const { code } = await mod.obtain()

    return [
      code,
      { 'Last-Modified': mtime.toJSON(), 'Content-Type': 'application/javascript' }
    ]
  }

  async readBundleJs(id, query) {
    const [, name, version] = id.match(rModuleId)
    const pkg = this.package.find({ name, version })

    if (!pkg) throw new Error(`unready package ${name}/${version}`)

    const entries = pkg.bundleEntries
    const result = await pkg.bundle(entries, { minify: false, all: this.preload.length > 0 })
    const { code } = await this.writeSourceMap({ id, name, ...result })

    return [code, { 'Last-Modified': new Date() }]
  }

  async readJs(id, query) {
    const isMain = id.endsWith('.js') && 'main' in query
    const isEntry = isMain || 'entry' in query
    const mod = await this.parseId(id, { isEntry })

    if (!mod) return

    const { fake, package: pkg } = mod
    const mtime = fake ? new Date() : (await lstat(mod.fpath)).mtime.toJSON()

    const { preload } = pkg.app
    const result = await pkg.bundle([mod.file], {
      minify: false,
      all: preload.length > 0 || !pkg.transpiler,
      loader: isMain
    })

    const { code } = await this.writeSourceMap({
      id, isMain, name: pkg.name, ...result
    })

    return [code, { 'Last-Modified': mtime }]
  }

  async readFile(file, query) {
    await this.ready

    const { package: pkg } = this
    const ext = path.extname(file)
    let result = null

    if (file === 'loader.js') {
      result = await this.readBuiltinJs(file)
    }
    else if (file === 'loaderConfig.json') {
      result = [
        JSON.stringify(Object.assign(pkg.loaderConfig, { lock: pkg.lock })),
        { 'Last-Modified': new Date() }
      ]
    }
    else if (await this.isRawFile(file)) {
      result = await this.readRawFile(file)
    }
    else if (/\/~bundle-[0-9a-f]{8}\.js$/.test(file)) {
      result = await this.readBundleJs(file, query)
    }
    else if (ext === '.js') {
      result = await this.readJs(file, query)
    }
    else if (ext === '.css') {
      result = await this.readCss(file, query)
    }
    else if (ext === '.json') {
      result = await this.readJson(file, query)
    }
    else if (rExt.test(ext)) {
      const [fpath] = await pkg.resolve(file)
      if (fpath) {
        result = await this.readFilePath(fpath)
      }
    }

    if (result) {
      result[1] = {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.lookup(ext),
        ETag: crypto.createHash('md5').update(result[0]).digest('hex'),
        ...result[1]
      }
    }

    return result
  }

  func() {
    const Porter_readFile = this.readFile.bind(this)

    return function Porter_func(req, res, next) {
      if (res.headerSent) return next()

      function response(result) {
        if (result) {
          res.statusCode = 200
          res.set(result[1])
          if (req.fresh) {
            res.statusCode = 304
          } else {
            res.write(result[0])
          }
          res.end()
        } else {
          next()
        }
      }
      Porter_readFile(req.path.slice(1), req.query).then(response).catch(next)
    }
  }

  gen() {
    const Porter_readFile = this.readFile.bind(this)

    return function* Porter_generator(next) {
      const ctx = this
      if (ctx.headerSent) return yield next

      const id = ctx.path.slice(1)
      const result = yield Porter_readFile(id, ctx.query)

      if (result) {
        ctx.status = 200
        ctx.set(result[1])
        if (ctx.fresh) {
          ctx.status = 304
        } else {
          ctx.body = result[0]
        }
      } else {
        yield next
      }
    }
  }

  async() {
    const Porter_readFile = this.readFile.bind(this)

    return async function Porter_async(ctx, next) {
      if (ctx.headerSent) return await next()

      const id = ctx.path.slice(1)
      const result = await Porter_readFile(id, ctx.query)

      if (result) {
        ctx.status = 200
        ctx.set(result[1])
        if (ctx.fresh) {
          ctx.status = 304
        } else {
          ctx.body = result[0]
        }
      } else {
        await next()
      }
    }
  }
}

module.exports = Porter
