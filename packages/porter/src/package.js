'use strict'

const crypto = require('crypto')
const debug = require('debug')('porter')
const fs = require('mz/fs')
const looseEnvify = require('loose-envify')
const path = require('path')
const querystring = require('querystring')
const { SourceMapConsumer, SourceMapGenerator, SourceNode } = require('source-map')
const UglifyJS = require('uglify-js')
const util = require('util')

const mkdirp = util.promisify(require('mkdirp'))
const Module = require('./module')
const CssModule = require('./cssModule')
const JsModule = require('./jsModule')
const JsonModule = require('./jsonModule')

/**
 * Leave the factory method of Module here to keep from cyclic dependencies.
 * @param {Object} opts
 * @returns {Module}
 */
Module.create = function(opts) {
  switch (path.extname(opts.file)) {
    case '.css':
      return new CssModule(opts)
    case '.json':
      return new JsonModule(opts)
    default:
      return new JsModule(opts)
  }
}

const { existsSync } = fs
const { lstat, readFile, realpath, writeFile } = fs


module.exports = class Package {
  constructor({ app, dir, paths, parent, package: pkg }) {
    // packageCache is necessary because there might be multiple asynchronous parsing tasks on the same package, such as `a => b` and `a => c => b`, which might return multiple package instance of `b` since neither one can find the other during the `Package.create()` call.
    const { packageCache } = app
    if (packageCache[dir]) return packageCache[dir]
    packageCache[dir] = this

    this.app = app
    this.dir = dir
    this.name = pkg.name
    this.version = pkg.version
    this.paths = paths || [dir]
    this.parent = parent
    this.dependencies = {}
    this.entries = {}
    this.files = {}
    this.folder = {}
    this.browser = {}
    this.browserify = pkg.browserify
    this.depPaths = []
    this.loaderCache = {}
    this.isolated = app.bundleExcept.includes(pkg.name)

    if (app.transpile.only.includes(pkg.name) && pkg.babel) {
      this.transpiler = 'babel'
      this.transpilerOpts = pkg.babel
    }

    const main = typeof pkg.browser == 'string' ? pkg.browser : pkg.main
    this.main = main ? main.replace(/^\.\//, '') : 'index.js'

    if (typeof pkg.browser == 'object') {
      Object.assign(this.browser, pkg.browser)
    }

    // https://github.com/foliojs/brotli.js/pull/22
    if (this.name == 'brotli') this.browser.fs = false
  }

  static async create({ dir, parent, app }) {
    // cnpm (npminstall) dedupes dependencies with symbolic links
    dir = await realpath(dir)
    const content = await readFile(path.join(dir, 'package.json'), 'utf8')
    const data = JSON.parse(content)

    // prefer existing package to de-duplicate packages
    if (app.package) {
      const { name, version } = data
      const pkg = app.package.find({ name, version })
      if (pkg) return pkg
    }

    const pkg = new Package({ dir, parent, app, package: data })
    await pkg.prepare()
    return pkg
  }

  get rootPackage() {
    let pkg = this
    while (pkg.parent) pkg = pkg.parent
    return pkg
  }

  get bundleEntries() {
    return Object.keys(this.entries)
      .filter(file => file.endsWith('.js'))
      .filter(file => {
        const { loaders } = this.entries[file]
        return !(loaders && 'worker-loader' in loaders)
      })
  }

  get all() {
    const iterable = { done: new WeakMap() }
    iterable[Symbol.iterator] = function * () {
      if (!iterable.done.has(this)) yield this
      iterable.done.set(this, true)
      for (const dep of Object.values(this.dependencies)) {
        if (iterable.done.has(dep)) continue
        yield* Object.assign(dep.all, { done: iterable.done })
      }
    }.bind(this)
    return iterable
  }

  /**
   * Find package by name or by name and version in the package tree.
   * @param {Object} opts
   * @param {string} opts.name
   * @param {string} opts.version
   * @returns {Package}
   */
  find({ name, version }) {
    if (!name) return this

    for (const pkg of this.all) {
      if (name == pkg.name) {
        if (!version || pkg.version == version) return pkg
      }
    }
  }

  findAll({ name }) {
    const result = []

    if (!name) return result
    for (const pkg of this.all) {
      if (name == pkg.name) result.push(pkg)
    }

    return result
  }

  async parseDepPaths() {
    const { depPaths } = this
    let pkg = this

    while (pkg) {
      const depPath = path.join(pkg.dir, 'node_modules')
      if (existsSync(depPath) && !depPaths.includes(depPath)) {
        depPaths.push(depPath)
      }
      pkg = pkg.parent
    }
  }

  async prepare() {
    await this.parseDepPaths()

    const { name, transpiler, app } = this
    if (app.transpile.only.includes(name) && !transpiler) {
      const obj = { babel: '.babelrc', typescript: 'tsconfig.json' }
      for (const prop in obj) {
        const configPath = path.join(this.dir, obj[prop])
        if (existsSync(configPath)) {
          this.transpiler = prop
          const content = await readFile(configPath, 'utf8')
          try {
            this.transpilerOpts = JSON.parse(content)
          } catch (err) {
            throw new Error(`${err.message} (${configPath})`)
          }
        }
      }
      // If enabled but not specified any transpiler, use the default one.
      if (!this.transpiler) {
        this.transpiler = app.package.transpiler
        this.transpilerOpts = app.package.transpilerOpts
      }
    }

    this.extensions = this.transpiler == 'typescript'
      ? ['.js', '.ts', '/index.js', '/index.ts']
      : ['.js', '/index.js']

    if (process.env.NODE_ENV !== 'production' && this.transpiler && !this.watching) {
      this.watching = true
      for (const dir of this.paths) {
        debug('watching %s', dir)
        fs.watch(dir, { persistent: false, recursive: true }, this.watch.bind(this))
      }
    }
  }

  watch(eventType, filename) {
    if (filename && filename in this.files) {
      this.reload(eventType, filename)
        .catch(err => console.error(err.stack))
    }
  }

  async reload(eventType, filename) {
    const mod = this.files[filename]
    const { app } = this
    const { dest } = app.cache
    const purge = id => {
      const fpath = path.join(dest, id)
      return fs.unlink(fpath)
        .then(() => debug('purge cache %s', fpath))
        .catch(() => {})
    }

    // the module might be `opts.lazyload`ed
    await purge(mod.id)

    if (this.parent) {
      // packages isolated with `opts.bundleExcept` or by other means
      await Promise.all(Object.values(this.entries).map(m => purge(m.id)))
    }

    // css bundling is handled by postcss-import, which won't use {@link Module@cache}.
    const ext = path.extname(filename)
    outer: for (const entry of app.entries.filter(file => file.endsWith(ext))) {
      const entryModule = app.package.entries[entry]
      for (const descendent of entryModule.family) {
        if (mod == descendent) {
          if (entry.endsWith('.css')) await entryModule.reload()
          await purge(entryModule.id)
          continue outer
        }
      }
    }

    // if the root module is not treated as `entries`, try traversing up
    let ancestor = mod
    while (ancestor.parent) ancestor = ancestor.parent
    await purge(ancestor.id)

    if (!mod.file.endsWith('.css')) {
      await mod.reload()
    }
  }

  tryRequire(name) {
    for (const depPath of this.depPaths) {
      try {
        return require(path.join(depPath, name))
      } catch (err) {
        // ignored
      }
    }
    console.error(new Error(`Cannot find module ${name} (${this.dir})`).stack)
  }

  async parseModule(file) {
    const { browser, files, folder } = this
    const originFile = file

    file = (browser[`./${file}`] || browser[`./${file}.js`] || file).replace(/^[\.\/]+/, '')
    if (file.endsWith('/')) file += 'index.js'
    if (!['.css', '.js', '.json'].includes(path.extname(file))) file += '.js'
    if (file in files) return files[file]

    const [fpath, suffix] = await this.resolve(file)

    if (fpath) {
      if (suffix.includes('/index')) {
        file = file.replace(/\.\w+$/, suffix)
        folder[originFile] = true
      }
      // There might be multiple resolves on same file.
      if (file in files) return files[file]
      const mod = Module.create({ file, fpath, pkg: this })
      return mod
    }
  }

  async parseEntry(entry) {
    // entry is '' when `require('foo/')`, should fallback to `this.main`
    if (!entry) entry = this.main
    const { app, dir, entries, name, version, files } = this
    const mod = await this.parseModule(entry)

    if (!mod) throw new Error(`unknown entry ${entry} (${dir})`)
    entries[mod.file] = files[mod.file] = mod
    if (this === app.package) app.entries = Object.keys(entries)

    await mod.parse()

    if (this.parent) {
      const { bundleEntries } = this

      if (app.preload.length > 0 && app.bundleExcept.includes(name)) {
        const allEntries = bundleEntries.map(file => [name, version, file].join('/'))
        for (const depName in this.dependencies) {
          const dep = this.dependencies[depName]
          allEntries.push(...dep.bundleEntries.map(file => [depName, dep.version, file]))
        }
        this.bundleEntry = `~bundle-${crypto.createHash('md5').update(allEntries.join(',')).digest('hex').slice(0, 8)}.js`
      }
      else if (app.preload.length == 0 && bundleEntries.length > 1) {
        this.bundleEntry = `~bundle-${crypto.createHash('md5').update(bundleEntries.join(',')).digest('hex').slice(0, 8)}.js`
      }
    }

    return mod
  }

  async parseFile(file) {
    const { files } = this
    const mod = await this.parseModule(file)

    if (mod) {
      files[mod.file] = mod
      await mod.parse()
      return mod
    }
  }

  /**
   * Parse an entry that has code or deps (or both) specified already..
   * @param {Object} opts
   * @param {string} opts.entry
   * @param {string[]} opts.deps
   * @param {string} opts.code
   */
  async parseFakeEntry({ entry, deps, code }) {
    const { entries, files, paths } = this
    const { moduleCache } = this.app
    const fpath = path.join(paths[0], entry)
    delete moduleCache[fpath]
    const mod = Module.create({ file: entry, fpath, pkg: this })

    Object.assign(mod, { deps, code, fake: true })
    entries[mod.file] = files[mod.file] = mod
    await mod.parse()
    return mod
  }

  async parsePackage({ name, entry }) {
    if (this.dependencies[name]) {
      const pkg = this.dependencies[name]
      return pkg.parseEntry(entry)
    }

    for (const depPath of this.depPaths) {
      const dir = path.join(depPath, name)
      if (existsSync(dir)) {
        const { app } = this
        const pkg = await Package.create({ dir, parent: this, app })
        this.dependencies[pkg.name] = pkg
        return pkg.parseEntry(entry)
      }
    }
  }

  async resolve(file) {
    const [, fname, ext] = file.match(/^(.*?)(\.(?:\w+))$/)
    const suffixes = ext == '.js' ? this.extensions : [ext]

    for (const dir of this.paths) {
      for (const suffix of suffixes) {
        const fpath = path.join(dir, `${fname}${suffix}`)
        if (existsSync(fpath) && (await lstat(fpath)).isFile()) {
          return [fpath, suffix]
        }
      }
    }

    return []
  }

  get lock() {
    const lock = this.app.lock
      ? JSON.parse(JSON.stringify(this.app.lock))
      : {}

    for (const pkg of this.all) {
      const { name, version,  } = pkg
      const copies = lock[name] || (lock[name] = {})
      copies[version] = { ...copies[version], ...pkg.copy }
    }

    return lock
  }

  get copy() {
    const copy = { bundle: this.bundleEntry }
    const { dependencies, main } = this

    if (!/^(?:\.\/)?index(?:.js)?$/.test(main)) copy.main = main

    for (const name of ['folder', 'browser']) {
      const obj = this[name]
      if (Object.keys(obj).length > 0)  {
        copy[name] = { ...copy[name], ...obj }
      }
    }

    if (dependencies && Object.keys(dependencies).length > 0) {
      if (!copy.dependencies) copy.dependencies = {}
      for (const dep of Object.values(dependencies)) {
        copy.dependencies[dep.name] = dep.version
      }
    }

    return copy
  }

  get loaderConfig() {
    const { app, name, version, main } = this
    const { baseUrl, map, timeout } = app
    const preload = name == app.package.name ? app.preload : []

    return {
      baseUrl, map, preload, timeout,
      package: { name, version, main },
    }
  }

  async parseLoader(loaderConfig) {
    const fpath = path.join(__dirname, '..', 'loader.js')
    const code = await readFile(fpath, 'utf8')

    return new Promise(resolve => {
      const stream = looseEnvify(fpath, {
        BROWSER: true,
        NODE_ENV: process.env.NODE_ENV || 'development',
        loaderConfig
      })
      let buf = ''
      stream.on('data', chunk => buf += chunk)
      stream.on('end', () => resolve(buf))
      stream.end(code)
    })
  }

  async obtainLoader(loaderConfig) {
    return {
      code: await this.parseLoader(loaderConfig)
    }
  }

  async minifyLoader(loaderConfig = {}) {
    const { loaderCache } = this
    const cacheKey = querystring.stringify(loaderConfig)
    if (loaderCache[cacheKey]) return loaderCache[cacheKey]
    const code = await this.parseLoader(loaderConfig)

    return loaderCache[cacheKey] = UglifyJS.minify({ 'loader.js': code }, {
      compress: { dead_code: true },
      output: { ascii_only: true },
      sourceMap: { root: '/' },
      ie8: true
    })
  }

  async createSourceNode({ source, code, map }) {
    if (map instanceof SourceMapGenerator) {
      map = map.toJSON()
    }

    if (map) {
      const consumer = await new SourceMapConsumer(map)
      return SourceNode.fromStringWithSourceMap(code, consumer)
    } else {
      // Source code need to be mapped line by line for debugging in devtols to work.
      const lines = code.split('\n')
      const node = new SourceNode()
      for (let i = 0; i < lines.length; i++) {
        node.add(new SourceNode(i + 1, 0, source, lines[i]))
      }
      return node.join('\n')
      // return new SourceNode(1, 0, source, code)
    }
  }

  /**
   * Create a bundle from specified entries
   * @param {string[]} entries
   * @param {Object} opts
   * @param {boolean} opts.minify   whether to minify the bundle
   * @param {boolean} opts.package  whether to include dependencies at package scope
   * @param {boolean} opts.all      whether to include all dependencies
   * @param {boolean} opts.loader   whether to include the loader when entry is root entry, set to false to explicitly exclude the loader
   * @param {Object} opts.loaderConfig overrides {@link Package#loaderConfig}
   */
  async bundle(entries, opts) {
    opts = { minify: true, package: true, ...opts }
    const loaderConfig = Object.assign(this.loaderConfig, opts.loaderConfig)
    const done = {}
    const node = new SourceNode()
    const { app } = this

    /**
     * Traverse all the dependencies of ancestor module recursively to bundle them accordingly. Dependencies will be skipped if under such circumstances:
     * - module is just a placeholder object generated by {@link FacePackage}
     * - module is preloaded but the ancestor isn't one of the preload entry
     * - module is one of the bundle exceptions
     * @param {Module} mod
     * @param {Module} ancestor
     */
    async function traverse(mod, ancestor = mod) {
      const { package: pkg } = ancestor

      // might be a mocked module from FakePackage
      if (!(mod instanceof Module)) return
      if (done[mod.id]) return
      if (mod.package !== pkg && !opts.all) return
      if (loaderConfig.preload && mod.preloaded && !ancestor.isPreload) return
      if (opts.minify && mod.name == 'heredoc') return
      if (mod.package !== pkg && mod.package.isolated && !ancestor.isPreload) return

      done[mod.id] = true
      for (const child of mod.children) await traverse(child, ancestor)

      if (pkg.isolated || !mod.package.isolated) {
        const { code, map } = await (opts.minify ? mod.minify() : mod.obtain())
        const source = path.relative(app.root, mod.fpath)
        node.add(await pkg.createSourceNode({ source, code, map }))
      }
    }

    debug('bundle start %s/%s [%s]', this.name, this.version, entries)
    for (const entry of entries) {
      if (entry.endsWith('.css')) continue
      const ancestor = this.files[entry]
      if (!ancestor) throw new Error(`unparsed entry ${entry} (${this.dir})`)
      await traverse(ancestor)
    }

    const mod = this.files[entries[0]]

    if (mod.isRootEntry && !mod.isPreload) {
      const lock = opts.all && mod.fake ? mod.lock : this.lock
      node.prepend(`Object.assign(porter.lock, ${JSON.stringify(lock)})`)
    }

    if (mod.isRootEntry && opts.loader !== false) {
      const { code, map } = opts.minify
        ? await this.minifyLoader(loaderConfig)
        : await this.obtainLoader(loaderConfig)
      const source = 'loader.js'
      node.prepend(await this.createSourceNode({ source, code, map }))
      node.add(`porter["import"](${JSON.stringify(mod.id)})`)
    }

    debug('bundle end %s/%s [%s]', this.name, this.version, entries)
    return node.join('\n').toStringWithSourceMap({ sourceRoot: '/' })
  }

  /**
   * Fix source map related settings in both code and map.
   * @param {Object} opts
   * @param {string} opts.file
   * @param {string} opts.code
   * @param {Object|SourceMapGenerator} opts.map
   */
  setSourceMap({ file, code, map }) {
    code = file.endsWith('.js')
      ? `${code}\n//# sourceMappingURL=${path.basename(file)}.map`
      : `${code}\n/*# sourceMappingURL=${path.basename(file)}.map */`

    if (map instanceof SourceMapGenerator) map = map.toJSON()
    if (typeof map == 'string') map = JSON.parse(map)

    map.sources = map.sources.map(source => source.replace(/^\//, ''))
    map.sourceRoot = this.app.source.root

    return { code, map }
  }

  async compileAll(opts) {
    const pkgEntries = []

    for (const entry in this.entries) {
      if (!entry.endsWith('.js')) continue
      if (this.entries[entry].isRootEntry) {
        await this.compile(entry, opts)
      } else {
        pkgEntries.push(entry)
      }
    }

    await this.compile(pkgEntries, opts)
  }

  async compile(entries, opts) {
    if (!Array.isArray(entries)) entries = [entries]
    opts = { package: true, writeFile: true, ...opts }

    // compile({ entry: 'fake/entry', deps, code }, opts)
    if (typeof entries[0] == 'object') {
      await this.parseFakeEntry(entries[0])
      entries[0] = entries[0].entry
    }

    const { name, version } = this
    const { dest } = this.app
    const file = this.bundleEntry || entries[0]
    const fpath = path.join(dest, name, version, file)

    debug(`compile ${name}/${version}/${file} start`)
    const result = file.endsWith('.js') && (opts.package || opts.all)
      ? await this.bundle(entries, opts)
      : await this.files[entries[0]].minify()

    const { code, map } = this.setSourceMap({ file, ...result })
    if (!opts.writeFile) return { code, map }

    await mkdirp(path.dirname(fpath))
    await Promise.all([
      writeFile(fpath, code),
      writeFile(`${fpath}.map`, JSON.stringify(map, (k, v) => {
        if (k !== 'sourcesContent') return v
      }))
    ])
    debug(`compile ${name}/${version}/${file} end`)
  }
}
