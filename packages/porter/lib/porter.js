'use strict'

const atImport = require('postcss-import')
const autoprefixer = require('autoprefixer')
const debug = require('debug')('porter')
const farmhash = require('farmhash')
const fs = require('mz/fs')
const looseEnvify = require('loose-envify')
const mime = require('mime')
const path = require('path')
const postcss = require('postcss')
const querystring = require('querystring')
const rimraf = require('rimraf')
const { SourceMapConsumer, SourceMapGenerator, SourceNode } = require('source-map')
const UglifyJS = require('uglify-js')
const { exists, lstat, readFile, writeFile } = fs

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

class Module {
  constructor({ file, fpath, pkg }) {
    const { moduleCache } = pkg.app
    if (moduleCache[fpath]) return moduleCache[fpath]
    moduleCache[fpath] = this

    this.package = pkg
    this.name = pkg.name
    this.version = pkg.version

    this.file = file
    this.fpath = fpath
    this.children = []
    this.cache = []
  }

  get id() {
    return [this.name, this.version, this.file].join('/')
  }

  get isRootEntry() {
    const { file, loaders, package: pkg } = this
    return file in pkg.entries &&
      (!pkg.parent || (loaders && loaders['worker-loader']))
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

  get lock() {
    const lock = {}
    const packages = []

    for (const mod of this.family) {
      const { package: pkg } = mod
      if (packages.includes(pkg)) continue
      packages.push(pkg)
      const { name, version } = pkg
      const copies = lock[name] || (lock[name] = {})
      copies[version] = Object.assign(copies[version] || {}, pkg.copy)
    }

    const { package: rootPackage } = this
    const { name, version } = rootPackage
    const copy = lock[name][version]
    copy.dependencies = Object.keys(copy.dependencies).reduce((obj, prop) => {
      if (prop in lock) obj[prop] = copy.dependencies[prop]
      return obj
    }, {})

    return lock
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
    if (!mod) {
      const { rootPackage } = pkg
      const specifier = name == rootPackage.name ? (entry || rootPackage.main) : dep
      mod = await rootPackage.parseFile(specifier)
    }

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

    mod.loaders = loaders
    if (loaders['worker-loader']) {
      // modules required by worker-loader shall be treated as entries.
      mod.package.entries[mod.file] = mod
    } else {
      if (!mod.parent) mod.parent = this
      this.children.push(mod)
    }

    return mod
  }

  async parse() {
    if (this.loaded) return
    this.loaded = true

    const { fpath } = this
    const { code } = await this.load({
      code: this.code || await readFile(fpath, 'utf8')
    })
    const deps = this.deps || this.matchImport(code)

    await Promise.all(deps.map(this.parseDep, this))
  }

  matchImport(code) {
    const { file } = this

    if (file.endsWith('.css')) {
      return matchAtImport(code)
    }

    const { app } = this.package
    const deps = matchRequire.findAll(code)

    return app.ignore
      ? deps.filter(dep => !app.ignore.includes(dep))
      : deps
  }

  async loadJs({ code }) {
    const { fpath } = this
    code = await this.mightEnvify(fpath, code)
    return { code }
  }

  async load() {
    const { file, fpath } = this
    const code = this.code || await readFile(fpath, 'utf8')

    if (file.endsWith('.js')) {
      return await this.loadJs({ code })
    }

    const { id } = this
    const { cssLoader, root } = this.package.app

    /**
     * `from` must be absolute path to make sure the `baseDir` in
     * `atImportResolve()` function is correct. Otherwise it will be set to
     * process.cwd() which might not be `root` in some circumstances. Luckily
     * we've got `map.from` to specify the file path in source map.
     * - http://api.postcss.org/global.html#processOptions
     */
    const { css, map } = await cssLoader.process(code, {
      from: fpath,
      to: id,
      map: {
        inline: false,
        from: path.relative(root, fpath),
        sourcesContent: false
      }
    })

    return { code: css, map: map.toJSON() }
  }

  transpileTypeScript({ code, }) {
    const { fpath, id, package: pkg } = this
    const ts = pkg.tryRequire('typescript')

    if (!ts) return { code }

    const { compilerOptions } = pkg.transpilerOpts
    const { outputText, diagnostics, sourceMapText } = ts.transpileModule(code, {
      compilerOptions: { ...compilerOptions, module: 'commonjs' }
    })
    const map = JSON.parse(sourceMapText)

    map.sources = [path.relative(pkg.app.root, fpath)]
    map.file = id
    map.sourceRoot = '/'

    if (diagnostics.length) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.file) {
          let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
          let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
          console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`)
        }
        else {
          console.log(`${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
        }
      }
    }

    return {
      code: outputText.replace(/\/\/# sourceMappingURL=.*$/, ''),
      map
    }
  }

  async transpileEcmaScript({ code, }) {
    const { fpath, package: pkg } = this
    const babel = pkg.tryRequire('babel-core')

    if (!babel) return { code }

    return await babel.transform(code, {
      ...pkg.transpilerOpts,
      sourceMaps: true,
      sourceRoot: '/',
      ast: false,
      filename: fpath,
      filenameRelative: path.relative(pkg.dir, fpath),
      sourceFileName: path.relative(pkg.dir, fpath)
    })
  }

  async transpileJs({ code, map }) {
    const { fpath, package: pkg } = this

    /**
     * `babel.transform` finds presets and plugins relative to `fpath`. If `fpath`
     * doesn't start with pkg.dir, it's quite possible that the needed presets or
     * plugins might not be found.
     */
    if (!fpath.startsWith(pkg.dir)) return { code, map }

    switch (pkg.transpiler) {
    case 'babel':
      return this.transpileEcmaScript({ code, map })
    case 'typescript':
      return this.transpileTypeScript({ code, map })
    default:
      return { code, map }
    }
  }

  async transpileCss({ code, map }) {
    const { fpath, id } = this
    const { cssTranspiler, root } = this.package.app

    /**
     * PostCSS doesn't support sourceRoot yet
     * https://github.com/postcss/postcss/blob/master/docs/source-maps.md
     */
    const result = await cssTranspiler.process(code, {
      from: fpath,
      to: id,
      map: {
        inline: false,
        prev: map,
        from: path.relative(root, fpath),
        sourcesContent: false
      }
    })

    map = JSON.parse(result.map)
    map.sourceRoot = '/'

    return { code: result.css, map }
  }

  transportJs({ code, map }) {
    const { id, deps } = this

    return {
      code: [
        `define(${JSON.stringify(id)}, ${JSON.stringify(deps)}, function(require, exports, module) {${code}`,
        '})'
      ].join('\n'),
      map
    }
  }

  async transpile(opts) {
    if (this.file.endsWith('.css')) {
      return this.transpileCss(opts)
    }

    return this.transportJs(await this.transpileJs(opts))
  }

  /**
   * Find deps of code and compare them with existing `this.deps` to see if there's
   * new dep to parse. Only the modules of the root package are checked.
   * @param {Object} opts
   * @param {string} opts.code
   * @returns {Array} [deps, reload]
   */
  async checkDeps({ code }) {
    if (this.file.endsWith('.css')) return [null, false]

    const deps = this.matchImport(code)
    let reload = false

    if (!this.package.parent && this.deps) {
      for (const dep of deps) {
        if (this.deps.includes(dep)) continue
        const mod = await this.parseDep(dep)
        if (mod && mod.package !== this.package) reload = true
      }
    }

    return [deps, reload]
  }

  async transpileWithCache({ code, map }) {
    const digest = farmhash.hash64(code)
    const [cacheCode, cacheDigest, cacheMap] = this.cache

    if (digest == cacheDigest) {
      return { code: cacheCode, map: JSON.parse(cacheMap) }
    }

    const [deps, reload] = await this.checkDeps({ code })
    this.deps = deps
    const result = await this.transpile({ code, map })

    if (result.map) {
      const mapText = JSON.stringify(result.map, (k, v) => {
        if (k !== 'sourcesContent') return v
      })
      this.cache = [result.code, digest, mapText]
    }

    if (reload) {
      const { lock } = this.package
      return {
        code: `Object.assign(porter.lock, ${JSON.stringify(lock)});${result.code}`,
        map: result.map
      }
    } else {
      return result
    }
  }

  /**
   * @returns {Object}
   */
  async obtain() {
    const { file, package: pkg } = this

    if (file.endsWith('.js') && !pkg.transpiler && this.cache[0]) {
      return { code: this.cache[0] }
    }

    const { code, map } = await this.load()

    // initialize module dependencies, will be used to check dependency changes to reload package lock.
    if (this.file.endsWith('.js') && !this.deps) {
      this.deps = this.matchImport(code)
    }

    if (!pkg.transpiler) {
      const result = this.transportJs(await this.load())
      this.cache = [result.code, null, null]
      return { code: result.code }
    }

    return this.transpileWithCache({ code, map })
  }

  async minify() {
    if (this.minified) return this.minified
    const { code, map } = await this.load()
    const { id } = this

    if (id.endsWith('.css')) {
      return this.minified = await this.transpile({ code, map })
    }

    const deps = this.deps || this.matchImport(code)
    for (let i = deps.length - 1; i >= 0; i--) {
      if (deps[i].endsWith('heredoc')) deps.splice(i, 1)
    }
    this.deps = deps
    this.minified = this.tryUglify(await this.transpile({ code, map }))
    return this.minified
  }

  tryUglify({ code, map }) {
    try {
      return this.uglify({ code, map }, UglifyJS)
    } catch (err) {
      return this.uglify({ code, map }, require('uglify-es'))
    }
  }

  uglify({ code, map }, uglifyjs) {
    const { fpath } = this
    const source = path.relative(this.package.app.root, fpath)
    const parseResult = uglifyjs.minify({ [source]: code }, {
      parse: {},
      compress: false,
      mangle: false,
      output: { ast: true, code: false }
    })

    if (parseResult.error) {
      const err = parseResult.error
      throw new Error(`${err.message} (${err.filename}:${err.line}:${err.col})`)
    }

    const result = uglifyjs.minify(deheredoc(parseResult.ast), {
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
        content: map,
        root: '/'
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

class Package {
  constructor({ app, dir, paths, parent }) {
    const { packageCache } = app
    if (packageCache[dir]) return packageCache[dir]
    packageCache[dir] = this

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    this.app = app
    this.dir = dir
    this.name = pkg.name
    this.version = pkg.version
    this.paths = paths || [dir]
    this.parent = parent
    this.dependencies = {}
    this.entries = {}
    this.files = {}
    this.alias = {}
    this.transform = (pkg.browserify && pkg.browserify.transform) || []
    this.depPaths = []

    if (app.transpile.only.includes(pkg.name) && pkg.babel) {
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

    const { name, transpiler, app } = this
    if (app.transpile.only.includes(name) && !transpiler) {
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
      // If enabled but not specified any transpiler, use the default one.
      if (!this.transpiler) {
        this.transpiler = app.package.transpiler
        this.transpilerOpts = app.package.transpilerOpts
      }
    }

    this.extensions = this.transpiler == 'typescript'
      ? ['.js', '.ts', '/index.js', '/index.ts']
      : ['.js', '/index.js']
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
      const mod = new Module({ file, fpath, pkg: this })
      return mod
    }
  }

  async parseEntry(entry = this.main) {
    const { app, dir, entries, files } = this
    const mod = await this.parseModule(entry)

    if (!mod) throw new Error(`unknown entry ${entry} (${dir})`)
    entries[mod.file] = files[mod.file] = mod
    app.entries = Object.keys(entries)
    await mod.parse()
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
    const mod = new Module({ file: entry, fpath, pkg: this })

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
      if (await exists(dir)) {
        const { app } = this
        // cnpm (npminstall) dedupes dependencies with symbolic links
        const pkg = new Package({ dir: await fs.realpath(dir), parent: this, app })
        await pkg.prepare()
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
        if (await exists(fpath) && (await lstat(fpath)).isFile()) {
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
      copies[version] || (copies[version] = {})
      copies[version] = Object.assign(copies[version] || {}, pkg.copy)
    }

    return lock
  }

  bundleFileName(entries) {
    const hash = farmhash.hash64(entries.join(','))
    return `~bundle-${hash.slice(0, 8)}.js`
  }

  get copy() {
    const copy = {}
    const { dependencies, alias, main, bundleEntries } = this

    if (!/^(?:\.\/)?index(?:.js)?$/.test(main)) copy.main = main

    if (alias && Object.keys(alias).length > 0)  {
      copy.alias = Object.assign({}, copy.alias, alias)
    }

    if (Object.keys(bundleEntries).length > 1) {
      copy.bundle = this.bundleFileName(bundleEntries)
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

  async parseLoader(opts) {
    const fpath = path.join(__dirname, '..', 'loader.js')
    const code = await readFile(fpath, 'utf8')
    const loaderConfig = Object.assign(this.loaderConfig, opts)

    return await envify(fpath, code, { loaderConfig })
  }

  async obtainLoader(opts) {
    return {
      code: await this.parseLoader(opts)
    }
  }

  async minifyLoader(opts = {}) {
    const { loaderCache } = this.app
    const cacheKey = querystring.stringify(opts)
    if (loaderCache[cacheKey]) return loaderCache[cacheKey]
    const code = await this.parseLoader(opts)

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
      const lines = code.split('\n')
      const node = new SourceNode()
      for (let i = 0; i < lines.length; i++) {
        node.add(new SourceNode(i + 1, 0, source, lines[i]))
      }
      return node.join('\n')
    }
  }

  async bundle(entries, opts) {
    opts = { minify: true, package: true, ...opts }
    const done = {}
    const node = new SourceNode()
    const { bundle, root } = this.app

    async function traverse(mod, ancestor = mod) {
      const { package: pkg } = ancestor
      const skippable = done[mod.id] ||
        (mod.package !== pkg && !opts.all) ||
        (mod.preloaded && !ancestor.isPreload) ||
        (bundle.except.includes(mod.name) && ancestor.name != mod.name) ||
        (opts.minify && mod.name === 'heredoc')

      if (skippable) return
      done[mod.id] = true
      for (const child of mod.children) await traverse(child, ancestor)
      const { code, map } = await (opts.minify ? mod.minify() : mod.obtain())
      const source = path.relative(root, mod.fpath)
      node.add(await pkg.createSourceNode({ source, code, map }))
    }

    for (const entry of entries) {
      if (entry.endsWith('.css')) continue
      const ancestor = this.files[entry]
      if (!ancestor) throw new Error(`unparsed entry ${entry} (${this.dir})`)
      await traverse(ancestor)
    }

    const mod = this.files[entries[0]]
    const lock = opts.all && mod.fake ? mod.lock : this.lock

    if (mod.isRootEntry || mod.isPreload) {
      node.prepend(`Object.assign(porter.lock, ${JSON.stringify(lock)})`)
    }

    if (mod.isRootEntry) {
      if (opts.loader !== false) {
        const { code, map } = opts.minify
          ? await this.minifyLoader(opts.loaderConfig)
          : await this.obtainLoader(opts.loaderConfig)
        const source = 'loader.js'
        node.prepend(await this.createSourceNode({ source, code, map }))
      }
      node.add(`porter["import"](${JSON.stringify(mod.id)})`)
    }

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
    const file = entries.length > 1 ? this.bundleFileName(entries) : entries[0]
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

/**
 * FakePackage is used to anticipate a Porter project. With FakePackage we can
 * create Porter instances that maps existing Porter setup.
 */
class FakePackage extends Package {
  constructor(opts) {
    const { app, dir, paths, package: pkg, lock } = opts
    super({ app, dir, paths })

    this._lock = lock
    this._package = pkg

    const { name, version } = pkg
    Object.assign(this, { name, version })
  }

  /**
   * The real package lock should be used
   */
  get lock() {
    return this._lock
  }

  /**
   * The real package name and version should be used.
   */
  get loaderConfig() {
    return { ...super.loaderConfig, package: this._package }
  }

  /**
   * To eliminate "unmet dependency" warnings.
   * @param {Object} opts
   */
  async parsePackage({ name, entry }) {
    const mod = await super.parsePackage({ name, entry })
    if (mod) return mod

    const { _lock: lock } = this
    const deps = lock[this.name][this.version].dependencies

    if (name in deps) {
      const version = deps[name]
      return {
        name,
        version,
        file: entry || lock[name][version].main || 'index.js'
      }
    } else {
      return {
        name: this.name,
        version: this.version,
        file: entry
      }
    }
  }
}

class Porter {
  constructor(opts) {
    const root = opts.root || process.cwd()
    const paths = [].concat(opts.paths == null ? 'components' : opts.paths).map(loadPath => {
      return path.resolve(root, loadPath)
    })
    const dest = path.resolve(root, opts.dest || 'public')
    const transpile = { only: [], ...opts.transpile }
    const cache = { dest, except: [], persist: true, ...opts.cache }
    const bundle = { except: [], ...opts.bundle }

    Object.assign(this, { root, dest, cache, transpile, bundle })
    const pkg = opts.package || require(path.join(root, 'package.json'))

    transpile.only.push(pkg.name)
    if (!cache.except.includes('*')) {
      cache.except.push(pkg.name, ...transpile.only)
    }
    cache.dest = path.resolve(root, cache.dest)

    this.loaderCache = {}
    this.moduleCache = {}
    this.packageCache = {}

    this.package = opts.package
      ? new FakePackage({ dir: root, paths, app: this, package: opts.package, lock: opts.lock })
      : new Package({ dir: root, paths, app: this })

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
      result[0] = await this.package.parseLoader()
    }

    return result
  }

  async prepare(opts = {}) {
    const { package: pkg } = this
    const { entries, lazyload, preload } = this

    await pkg.prepare()
    await Promise.all([
      ...entries.map(entry => pkg.parseEntry(entry)),
      [...lazyload, ...preload].map(file => pkg.parseFile(file))
    ])

    if (preload.length > 0) {
      const entry = await pkg.parseFile(preload[0])
      entry.isPreload = true
      for (const mod of entry.family) {
        mod.preloaded = true
      }
    }

    const { cache } = this
    if (!cache.persist) {
      rimraf(path.join(cache.dest, '**/*.{cache,css,js,map,md5}'), err => {
        if (err) console.error(err.stack)
      })
    }
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
      const pkg = this.package.find({ name })
      if (!pkg) throw new Error(`unable to find exclusive package ${name}`)
      await pkg.compileAll(opts)
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
      await this.compileExclusivePackages({ all: this.preload.length > 0 })
    } else {
      await this.compilePackages({ all: this.preload.length > 0 })
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

  async writeSourceMap({ id, isMain, name, code, map }) {
    const { dest, except } = this.cache
    const fpath = path.join(dest, id)

    if (map instanceof SourceMapGenerator) {
      map = map.toJSON()
    }

    const mapPath = isMain ? `${fpath}-main.map` : `${fpath}.map`
    code = id.endsWith('.js')
      ? `${code}\n//# sourceMappingURL=${path.basename(mapPath)}`
      : `${code}\n/*# sourceMappingURL=${path.basename(mapPath)}`

    await mkdirp(path.dirname(fpath))
    await Promise.all([
      except.includes(name) ? Promise.resolve() : writeFile(fpath, code),
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

  async readBundleJs(id, query) {
    const [, name, version] = id.match(rModuleId)
    const pkg = this.package.find({ name, version })

    if (!pkg) throw new Error(`unready package ${name}/${version}`)

    const entries = pkg.bundleEntries
    const result = await pkg.bundle(entries, { minify: false })
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
    let result

    if (preload.length > 0) {
      result = await pkg.bundle([mod.file], { minify: false, all: true })
    } else {
      result = await pkg.bundle([mod.file], {
        minify: false,
        package: !pkg.transpiler,
        loader: isMain
      })
    }

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
    else if (rExt.test(ext)) {
      const [fpath] = await pkg.resolve(file)
      if (fpath) {
        result = await this.readFilePath(fpath)
      }
    }

    if (result) {
      Object.assign(result[1], {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.lookup(ext),
        ETag: farmhash.hash64(result[0])
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
