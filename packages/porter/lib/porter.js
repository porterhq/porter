'use strict'

const atImport = require('postcss-import')
const autoprefixer = require('autoprefixer')
const crypto = require('crypto')
const debug = require('debug')('porter')
const fs = require('mz/fs')
const looseEnvify = require('loose-envify')
const mime = require('mime')
const path = require('path')
const postcss = require('postcss')
const querystring = require('querystring')
const rimraf = require('rimraf')
const UglifyJS = require('uglify-es')
// const util = require('util')
const { exists, lstat, readdir, readFile, unlink, writeFile } = fs

const deheredoc = require('./deheredoc')
const matchRequire = require('./matchRequire')
const mkdirp = require('./mkdirp')

const rExt = /\.(?:css|gif|jpg|jpeg|js|png|svg|swf|ico)$/i
const rModuleId = /^((?:@[^\/]+\/)?[^\/]+)(?:\/(\d+\.\d+\.\d+[^\/]*))?(?:\/(.*))?$/

function envify(fpath, code, env) {
  return new Promise(resolve => {
    const stream = looseEnvify(fpath, {
      BROWSER: true,
      NODE_ENV: process.env.NODE_ENV || 'development',
      ...env
    })
    let buf = ''
    stream.on('data', chunk => buf += chunk)
    stream.on('end', () => resolve(buf))
    stream.end(code)
  })
}

const rAtImport = /(?:^|\n)\s*@import\s+(['"])([^'"]+)\1;/g

function matchAtImport(code) {
  const deps = []
  let m
  rAtImport.lastIndex = 0
  while ((m = rAtImport.exec(code))) {
    deps.push(m[2])
  }
  return deps
}

const moduleCache = {}

class Module {
  constructor({ name, version, file, fpath }) {
    if (moduleCache[fpath]) return moduleCache[fpath]
    moduleCache[fpath] = this

    this.name = name
    this.version = version
    this.file = file
    this.fpath = fpath
    this.children = []
  }

  get id() {
    return [this.name, this.version, this.file].join('/')
  }

  get family() {
    const iterable = { done: {} }
    iterable[Symbol.iterator] = function* () {
      if (!iterable.done[this.id]) {
        iterable.done[this.id] = true
        for (const child of Object.values(this.children)) {
          if (iterable.done[child.id]) continue
          yield* Object.assign(child.family, { done: iterable.done })
        }
        yield this
      }
    }.bind(this)
    return iterable
  }

  async mightEnvify(fpath, code) {
    const { package: pkg } = this
    if (pkg.transform.some(name => name == 'envify' || name == 'loose-envify')) {
      return envify(fpath, code)
    } else {
      return code
    }
  }

  async parseRelative(dep) {
    const file = path.join(path.dirname(this.file), dep)
    const { package: pkg } = this

    return await pkg.parseFile(file)
  }

  async parseNonRelative(dep) {
    const { package: pkg } = this
    const [, name, , entry] = dep.match(rModuleId)
    let mod = await pkg.parsePackage({ name, entry })

    // Allow root/a => package/b => root/c
    if (!mod) mod = pkg.rootPackage.parseFile(dep)

    return mod
  }

  async parseDep(dep) {
    // require('https://example.com/foo.js')
    if (/^(?:https?:)?\/\//.test(dep)) return

    const loaders = {}

    if (dep.includes('!')) {
      const segments = dep.split('!')
      dep = segments.pop()
      for (const segment of segments) {
        const [loader, opts] = segment.split('?')
        loaders[loader] = querystring.parse(opts)
      }
    }

    const mod = dep.startsWith('.')
      ? await this.parseRelative(dep)
      : await this.parseNonRelative(dep)

    if (!mod) {
      console.error(new Error(`unmet dependency ${dep} (${this.fpath})`).stack)
      return
    }

    if (loaders['worker-loader']) {
      // modules required by worker-loader shall be treated as entries.
      mod.package.entries[mod.file] = mod
    }

    mod.loaders = loaders
    if (!mod.parent) mod.parent = this
    this.children.push(mod)
    return mod
  }

  async parse() {
    if (this.loaded) return
    this.loaded = true

    const { file, fpath } = this
    const code = await readFile(fpath, 'utf8')
    const deps = file.endsWith('.js')
      ? matchRequire.findAll(await this.mightEnvify(fpath, code))
      : matchAtImport(code)

    await Promise.all(deps.map(this.parseDep, this))
  }

  async loadJs({ code }) {
    const { file, fpath, package: pkg } = this

    if (!pkg.parent && file in pkg.entries && pkg.preload.length > 0) {
      // lazy parse preloaded modules
      const calls = pkg.preload.map(specifier => `require(${JSON.stringify(specifier)})`)
      code = code.replace(/^(\s*(['"])use strict\2)?/, `$1;${calls.join(';')}`)
    }

    code = await this.mightEnvify(fpath, code)
    return { code }
  }

  async load() {
    const { file, fpath } = this
    const code = await readFile(fpath, 'utf8')

    if (file.endsWith('.js')) {
      return await this.loadJs({ code })
    }

    const { id } = this
    const { cssLoader, root } = this.package.rootPackage
    const { css, map } = await cssLoader.process(code, {
      from: path.relative(root, fpath),
      to: id,
      map: { inline: false }
    })

    return { code: css, map }
  }

  async transpileJs({ code, map }) {
    const { fpath, package: pkg } = this

    if (!fpath.startsWith(pkg.root)) return { code, map }

    switch (pkg.transpiler) {
    case 'babel':
      const babel = pkg.tryRequire('babel-core')
      return await babel.transform(code, {
        ...pkg.transpilerOpts,
        sourceMaps: true,
        sourceRoot: '/',
        ast: false,
        filename: fpath,
        filenameRelative: path.relative(pkg.dir, fpath),
        sourceFileName: path.relative(pkg.dir, fpath)
      })
    case 'typescript':
      return { code, map }
    default:
      return { code, map }
    }
  }

  async transpileCss({ code, map }) {
    const { fpath, id } = this
    const { cssTranspiler, root } = this.package.rootPackage

    const result = await cssTranspiler.process(code, {
      from: path.relative(root, fpath),
      to: id,
      map: { inline: false, prev: map }
    })

    return { code: result.css, map: result.map }
  }

  async transpile(opts) {
    if (this.file.endsWith('.css')) {
      return this.transpileCss(opts)
    }

    const { id, deps } = this
    const { code, map } = await this.transpileJs(opts)

    return {
      code: `define(${JSON.stringify(id)}, ${JSON.stringify(deps)}, function(require, exports, module) {${code}
})`,
      map
    }
  }

  async fetch() {
    const { id } = this
    const { dest } = this.package.cache
    const { code, map } = await this.load()
    const digest = crypto.createHash('md5').update(code).digest('hex')
    const cacheName = id.replace(/(\.(?:css|js))$/, `-${digest}$1`)
    const cachePath = path.join(dest, cacheName)

    if (await exists(cachePath)) {
      return { code: await readFile(cachePath, 'utf8') }
    }

    const deps = matchRequire.findAll(code)

    let reload = false
    if (!this.package.parent && this.deps) {
      for (const dep of deps) {
        if (this.deps.includes(dep)) continue
        const mod = await this.parseDep(dep)
        if (mod.package !== this.package) reload = true
      }
    }

    this.deps = deps
    const result = await this.transpile({ code, map })

    if (result.map) {
      const destDir = path.dirname(cachePath)
      await mkdirp(destDir)
      // clear stale cache
      const fname = path.basename(id).replace(rExt, '-')
      for (const file of (await readdir(destDir))) {
        if (file.startsWith(fname)) {
          await unlink(path.join(destDir, file))
        }
      }

      await Promise.all([
        writeFile(cachePath, result.code),
        writeFile(path.join(dest, `${id}.map`), JSON.stringify(result.map))
      ])
    }

    if (reload) {
      return {
        code: [
          `Object.assign(porter.lock, ${JSON.stringify(this.package.lock)})`,
          result.code
        ].join(';'),
        map: result.map
      }
    } else {
      return result
    }
  }

  async minify() {
    if (this.minified) return this.minified
    const { code, map } = await this.load()
    const { id } = this

    if (id.endsWith('.css')) {
      return this.minified = await this.transpile({ code, map })
    }

    const deps = this.deps || matchRequire.findAll(code)
    for (let i = deps.length - 1; i >= 0; i--) {
      if (deps[i].endsWith('heredoc')) deps.splice(i, 1)
    }
    this.deps = deps
    this.minified = this.uglify(await this.transpile({ code, map }))
    return this.minified
  }

  uglify({ code, map }) {
    const { id } = this
    const { ast } = UglifyJS.minify({ [id]: code }, {
      parse: {},
      compress: false,
      mangle: false,
      output: { ast: true, code: false }
    })

    const result = UglifyJS.minify(deheredoc(ast), {
      compress: {
        dead_code: true,
        global_defs: {
          process: {
            env: {
              BROWSER: true,
              NODE_ENV: process.env.NODE_ENV
            }
          }
        }
      },
      output: { ascii_only: true },
      sourceMap: {
        root: '/',
        content: map
      },
      ie8: true
    })

    if (result.error) {
      const err = result.error
      throw new Error(`${err.message} (${err.filename}:${err.line}:${err.col})`)
    }
    return result
  }
}

const packageCache = {}

class Package {
  constructor({ root, dir, paths, dest, cache, parent, transpile }) {
    if (packageCache[dir]) return packageCache[dir]
    packageCache[dir] = this

    const pkg = require(path.join(dir, 'package.json'))
    this.root = root
    this.dir = dir
    this.name = pkg.name
    this.version = pkg.version
    this.paths = paths || [dir]
    this.dest = dest
    this.cache = cache
    this.parent = parent
    this.dependencies = {}
    this.entries = {}
    this.files = {}
    this.alias = {}
    this.transform = (pkg.browserify && pkg.browserify.transform) || []
    this.transpile = transpile
    this.depPaths = []

    // root package shall always check if it needs transpilation.
    if (!parent) transpile.only.push(pkg.name)
    if (transpile.only.includes(pkg.name) && pkg.babel) {
      this.transpiler = 'babel'
      this.transpilerOpts = pkg.babel
    }

    const main = typeof pkg.browser == 'string' ? pkg.browser : pkg.main
    this.main = main ? main.replace(/^\.\//, '') : 'index.js'
  }

  get rootPackage() {
    let pkg = this
    while (pkg.parent) pkg = pkg.parent
    return pkg
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

  find({ name, version }) {
    if (!name) return this

    for (const pkg of this.all) {
      if (name == pkg.name) {
        if (!version || pkg.version == version) return pkg
      }
    }
  }

  async parseDepPaths() {
    const { depPaths } = this
    let pkg = this

    while (pkg) {
      const depPath = path.join(pkg.dir, 'node_modules')
      if ((await exists(depPath)) && !depPaths.includes(depPath)) {
        depPaths.push(depPath)
      }
      pkg = pkg.parent
    }
  }

  async prepare() {
    await this.parseDepPaths()

    const { name, transpile, transpiler } = this
    if (transpile.only.includes(name) && !transpiler) {
      const obj = { babel: '.babelrc', typescript: 'tsconfig.json' }
      for (const prop in obj) {
        const configPath = path.join(this.dir, obj[prop])
        if (await exists(configPath)) {
          this.transpiler = prop
          const content = await readFile(configPath, 'utf8')
          try {
            this.transpilerOpts = JSON.parse(content)
          } catch (err) {
            throw new Error(`${err.message} (${configPath})`)
          }
        }
      }
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
    throw new Error(`Cannot find module ${name}`)
  }

  async atImportResolve(id, baseDir, importOptions) {
    if (id.startsWith('.')) return path.join(baseDir, id)

    const [fpath] = await this.resolve(id)
    if (fpath) return fpath

    const [, name, , file] = id.match(rModuleId)
    if (name in this.dependencies) {
      const pkg = this.dependencies[name]
      const result = await pkg.resolve(file)
      return result[0]
    }
  }

  async parseEntry(entry = this.main) {
    const { dir, entries } = this
    const mod = await this.parseFile(entry)

    if (!mod) throw new Error(`unknown entry ${entry} (${dir})`)

    if (!this.parent && this.preload.length > 0) {
      await Promise.all(this.preload.map(dep => mod.parseDep(dep)))
    }

    entries[mod.file] = mod
    return mod
  }

  async parseFile(file) {
    const { alias, files } = this
    const originFile = file

    if (file.endsWith('/')) {
      file += 'index.js'
      alias[originFile] = file
    }
    if (!['.css', '.js'].includes(path.extname(file))) file += '.js'
    if (file in files) return files[file]

    const [fpath, suffix] = await this.resolve(file)

    if (fpath) {
      if (suffix.includes('/index')) {
        file = file.replace(rExt, suffix)
        alias[originFile] = file
      }
      // There might be multiple resolves on same file.
      if (file in files) return files[file]
      const { name, version } = this

      const mod = new Module({ name, version, file, fpath })
      mod.package = this
      await mod.parse()
      files[file] = mod
      return mod
    }
  }

  async parsePackage({ name, entry }) {
    if (this.dependencies[name]) {
      const pkg = this.dependencies[name]
      return pkg.parseEntry(entry)
    }

    for (const depPath of this.depPaths) {
      const dir = path.join(depPath, name)
      if (await exists(dir)) {
        const { root, dest, cache, transpile } = this
        const pkg = new Package({ root, dir, dest, cache, transpile, parent: this })
        await pkg.prepare()
        this.dependencies[pkg.name] = pkg
        return pkg.parseEntry(entry)
      }
    }
  }

  async resolve(file) {
    const [, fname, ext] = file.match(/^(.*?)(\.(?:\w+))$/)
    const suffixes = ext == '.js' ? ['.js', '/index.js'] : [ext]

    for (const dir of this.paths) {
      for (const suffix of suffixes) {
        const fpath = path.join(dir, `${fname}${suffix}`)
        if (await exists(fpath) && (await lstat(fpath)).isFile()) {
          return [fpath, suffix]
        }
      }
    }

    return []
  }

  get lock() {
    const lock = {}

    for (const pkg of this.all) {
      const { name, version, dependencies, alias, main, entries } = pkg
      const copies = lock[name] || (lock[name] = {})
      const copy = copies[version] || (copies[version] = {})

      if (!/^(?:\.\/)?index(?:.js)?$/.test(main)) copy.main = main

      if (alias && Object.keys(alias).length > 0)  {
        copy.alias = Object.assign({}, copy.alias, alias)
      }

      if (Object.keys(entries).length > 1) {
        const jsEntries = Object.keys(entries)
          .filter(prop => !prop.endsWith('.css'))
          .filter(prop => {
            const entry = pkg.files[prop]
            return !(entry.loaders && ('worker-loader' in entry.loaders))
          })

        if (jsEntries.length > 1) copy.bundle = true
      }

      if (dependencies && Object.keys(dependencies).length > 0) {
        if (!copy.dependencies) copy.dependencies = {}
        for (const dep of Object.values(dependencies)) {
          copy.dependencies[dep.name] = dep.version
        }
      }
    }

    return lock
  }

  async parseLoader(code) {
    const fpath = path.join(__dirname, '..', 'loader.js')
    if (!code) code = await readFile(fpath, 'utf8')
    let loaderConfig = this.rootPackage.loaderConfig

    if (this.parent) {
      loaderConfig = Object.assign({}, loaderConfig, {
        package: { name: this.name, version: this.version, entries: {} }
      })
    }

    return await envify(fpath, code, { loaderConfig })
  }

  async minifyLoader() {
    if (this.loader) return this.loader
    const code = await this.parseLoader()

    return this.loader = UglifyJS.minify({ 'loader.js': code }, {
      compress: { dead_code: true },
      output: { ascii_only: true },
      sourceMap: { root: '/' },
      ie8: true
    })
  }

  async bundle(...entries) {
    const opts = { minify: true, bundle: 'package' }
    if (typeof entries[entries.length - 1] === 'object') {
      Object.assign(opts, entries.pop())
    }
    const done = {}
    const chunks = []

    for (const entry of entries) {
      if (entry.endsWith('.css')) continue
      const ancestor = this.files[entry]
      for (const mod of ancestor.family) {
        if (done[mod.file]) continue
        if (mod.package !== this && opts.bundle !== 'all') continue
        done[mod.file] = true
        const { code, } = await (opts.minify ? mod.minify() : mod.fetch())
        chunks.push(code)
      }
    }

    const mod = this.files[entries[0]]
    const isMain = (mod.loaders && 'worker-loader' in mod.loaders) ||
      ['loader', 'all'].includes(opts.bundle)
    const isRootEntry = isMain || !this.parent

    if (isRootEntry) {
      chunks.unshift(`Object.assign(porter.lock, ${JSON.stringify(this.lock)})`)
    }

    if (isMain) {
      const { code, } = await this.minifyLoader()
      chunks.unshift(code)
      chunks.push(`porter["import"](${JSON.stringify(mod.id)})`)
    }

    return { code: chunks.join('\n') }
  }

  async compile(...entries) {
    if (entries.length === 0) return

    const opts = { bundle: 'package' }
    if (typeof entries[entries.length - 1] === 'object') {
      Object.assign(opts, entries.pop())
    }

    const { dest, name, version } = this
    const fname = entries.length > 1 ? '~bundle.js' : entries[0]
    const fpath = path.join(dest, name, version, fname)

    const { code, map } = fname.endsWith('.js') && opts.bundle
      ? await this.bundle(...entries, opts)
      : await this.files[entries[0]].minify()

    await mkdirp(path.dirname(fpath))
    await Promise.all([
      writeFile(fpath, code),
      writeFile(`${fpath}.map`, JSON.stringify(map, (k, v) => {
        if (k !== 'sourcesContent') return v
      }))
    ])
  }
}

class Porter {
  constructor(opts) {
    const root = opts.root || process.cwd()
    const paths = [].concat(opts.paths || 'components').map(loadPath => {
      return path.resolve(root, loadPath)
    })
    const dest = path.resolve(root, opts.dest || 'public')
    const transpile = { only: [], ...opts.transpile }
    const cache = { dest, except: [], ...opts.cache }
    const pkg = new Package({ root, dir: root, paths, dest, cache, transpile })

    pkg.preload = [].concat(opts.preload || [])
    pkg.lazyload = [].concat(opts.lazyload || [])

    if (!cache.except.includes('*')) cache.except.push(pkg.name)
    cache.dest = path.resolve(root, cache.dest)

    Object.assign(this, { root, dest, cache, package: pkg })

    pkg.loaderConfig = {
      baseUrl: '/',
      ...opts.loaderConfig,
      package: { name: pkg.name, version: pkg.version, entries: {} },
      cache: { except: cache.except }
    }

    this.source = { serve: false, root: '/', ...opts.source }
    this.ready = this.prepare(opts)
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
    return result
  }

  async readLoaderJs(pkg = this.package) {
    const result = await this.readBuiltinJs('loader.js')
    result[0] = await this.package.parseLoader(result[0])
    return result
  }

  async prepare(opts = {}) {
    if (process.env.NODE_ENV == 'production') {
      await Promise.all(
        ['loader.js', 'porter-sw.js'].map(this.readBuiltinJs, this)
      )
    }

    const { package: pkg } = this
    const entries = opts.entries || []

    await pkg.prepare()
    await Promise.all([
      ...entries.map(entry => pkg.parseEntry(entry)),
      ...pkg.lazyload.map(file => pkg.parseFile(file))
    ])

    pkg.cssLoader = postcss().use(
      atImport({
        path: pkg.paths,
        resolve: pkg.atImportResolve.bind(pkg)
      })
    )
    pkg.cssTranspiler = postcss().use(autoprefixer(opts.autoprefixer))

    const { cache } = this
    rimraf(path.join(cache.dest, `{${cache.except.join(',')}`), err => {
      if (err) console.error(err.stack)
    })
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
    await Promise.all(Array.from(this.package.all, async pkg => {
      if (pkg !== this.package) {
        return pkg.compile(...Object.keys(pkg.entries).filter(file => file.endsWith('.js')))
      }
    }))

    debug('compile entries')
    for (const entry of entries) {
      if (entry.endsWith('.css')) {
        await this.package.compile(entry)
      } else {
        await this.package.compile(entry, { bundle: 'loader' })
      }
    }

    debug('compile lazyload')
    for (const file of this.package.lazyload) {
      for (const mod of (await this.package.parseFile(file)).family) {
        await mod.package.compile(mod.file, { bundle: false })
      }
    }
    debug('done')
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
      if (fpath.startsWith(dir) && (await exists(fpath))) return true
    }

    return false
  }

  async readRawFile(file) {
    const fpath = path.join(this.root, file)

    if (await exists(fpath)) {
      return this.readFilePath(fpath)
    }
  }

  async parseId(id, { isEntry }) {
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

  async readCss(id, query) {
    const mod = await this.parseId(id, { isEntry: true })
    const { mtime } = await lstat(mod.fpath)
    const { code } = await mod.fetch()

    return [code, { 'Last-Modified': mtime.toJSON() }]
  }

  async readBundleJs(id, query) {
    const [, name, version] = id.match(rModuleId)
    const pkg = this.package.find({ name, version })
    const { code } = await pkg.bundle(...Object.keys(pkg.files), { minify: false })

    return [code, { 'Last-Modified': new Date() }]
  }

  async readJs(id, query) {
    const isMain = 'main' in query
    const isEntry = isMain || 'entry' in query
    const mod = await this.parseId(id, { isEntry })

    if (!mod) return

    const { package: pkg } = mod
    const stats = await lstat(mod.fpath)
    const chunks = []

    if (isMain) {
      chunks.push((await this.readLoaderJs(pkg))[0])
    }

    if (isEntry) {
      chunks.push(`Object.assign(porter.lock, ${JSON.stringify(pkg.lock)})`)
    }

    const { code } = await mod.fetch()
    chunks.push(code)
    if (isMain) chunks.push(`porter["import"](${JSON.stringify(mod.id)})`)

    return [chunks.join(';'), { 'Last-Modified': stats.mtime.toJSON() }]
  }

  async readFile(file, query) {
    await this.ready

    const ext = path.extname(file)
    let result = null

    if (file === 'loader.js') {
      result = await this.readLoaderJs()
    }
    else if (file === 'loaderConfig.json') {
      result = [
        JSON.stringify(this.package.loaderConfig),
        { 'Last-Modified': (new Date()).toJSON() }
      ]
    }
    else if (file === 'porter-sw.js') {
      result = await this.readBuiltinJs(file)
    }
    else if (await this.isRawFile(file)) {
      result = await this.readRawFile(file)
    }
    else if (file.endsWith('~bundle.js')) {
      result = await this.readBundleJs(file, query)
    }
    else if (ext === '.js') {
      result = await this.readJs(file, query)
    }
    else if (ext === '.css') {
      result = await this.readCss(file, query)
    }
    else if (rExt.test(ext)) {
      const { package: pkg } = this
      const [fpath] = await pkg.resolve(file)
      if (fpath) {
        result = await this.readFilePath(fpath)
      }
    }

    if (result) {
      Object.assign(result[1], {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.lookup(ext),
        ETag: crypto.createHash('md5').update(result[0]).digest('hex')
      })
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
      if (ctx.headerSent) return await next

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
        await next
      }
    }
  }
}

module.exports = Porter
