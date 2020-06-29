'use strict'

const crypto = require('crypto')
const debug = require('debug')('porter')
const path = require('path')
const querystring = require('querystring')
const { access, writeFile } = require('mz/fs')
const util = require('util')

const mkdirp = util.promisify(require('mkdirp'))

const rModuleId = /^((?:@[^\/]+\/)?[^\/]+)(?:\/(\d+\.\d+\.\d+[^\/]*))?(?:\/(.*))?$/

module.exports = class Module {
  static get rModuleId() {
    return rModuleId
  }

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
    this.entries = []
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
          if (child instanceof Module){
            yield* Object.assign(child.family, { done: iterable.done })
          }
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

  async _addCache() {
    const fpath = path.join(this.package.app.cache.dest, this.id)
    const dir = path.dirname(fpath)

    try {
      await access(dir)
    } catch (err) {
      await mkdirp(dir)
    }

    await writeFile(`${fpath}.cache`, JSON.stringify(this.cache))
  }

  addCache(source, opts) {
    const digest = crypto.createHash('md5').update(source).digest('hex')
    const map = typeof opts.map === 'string' ? JSON.parse(opts.map) : opts.map

    this.cache = { ...opts, map, digest }
    this._addCache().catch(err => console.error(err.stack))
  }

  async parseRelative(dep) {
    const { package: pkg } = this
    const file = path.join(path.dirname(this.file), dep)

    return pkg.parseFile(file)
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

    const { package: pkg } = this
    if (dep == 'stream') pkg.browser.stream = 'readable-stream'
    const specifier = pkg.browser[dep] || pkg.browser[`${dep}.js`] || dep
    const mod = dep.startsWith('.')
      ? await this.parseRelative(specifier)
      : await this.parseNonRelative(specifier)

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
    throw new Error('unimplemented method')
  }

  matchImport() {
    throw new Error('unimplemented method')
  }

  async load() {
    throw new Error('unimplemented method')
  }

  async transpile() {
    throw new Error('unimplemented method')
  }

  /**
   * Find deps of code and compare them with existing `this.deps` to see if there's
   * new dep to parse. Only the modules of the root package are checked.
   * @param {Object} opts
   * @param {string} opts.code
   * @returns {Array}
   */
  async checkDeps({ code }) {
    if (this.file.endsWith('.css')) return [null, false]

    const deps = this.matchImport(code)

    if (!this.package.parent && this.deps) {
      for (const dep of deps) {
        if (this.deps.includes(dep)) continue
        await this.parseDep(dep)
      }
    }

    return deps
  }

  /**
   * @returns {Object}
   */
  async obtain() {
    if (!this.cache) {
      const { code, map } = await this.load()
      this.deps = this.matchImport(code)
      this.addCache(code, await this.transpile({ code, map }))
    }
    return this.cache
  }

  async reload() {
    debug(`reloading ${this.file} (${this.package.dir})`)
    const { code, map } = await this.load()
    this.deps = await this.checkDeps({ code })
    this.addCache(code, await this.transpile({ code, map }))
  }

  async minify() {
    throw new Error('unimplemented method')
  }
}
