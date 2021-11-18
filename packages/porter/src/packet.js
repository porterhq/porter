'use strict';

const debug = require('debug')('porter');
const { existsSync, watch, promises: fs } = require('fs');
const looseEnvify = require('loose-envify');
const path = require('path');
const { SourceMapGenerator } = require('source-map');
const util = require('util');

const glob = util.promisify(require('glob'));
const mkdirp = util.promisify(require('mkdirp'));
const Module = require('./module');
const CssModule = require('./css_module');
const JsModule = require('./js_module');
const TsModule = require('./ts_module');
const JsonModule = require('./json_module');
const WasmModule = require('./wasm_module');
const Bundle = require('./bundle');

/**
 * Leave the factory method of Module here to keep from cyclic dependencies.
 * @param {Object} opts
 * @returns {Module}
 */
Module.create = function(opts) {
  switch (path.extname(opts.file)) {
    case '.css':
      return new CssModule(opts);
    case '.json':
      return new JsonModule(opts);
    case '.wasm':
      return new WasmModule(opts);
    case '.ts':
    case '.tsx':
      return new TsModule(opts);
    default:
      return new JsModule(opts);
  }
};

const { lstat, readFile, realpath, writeFile } = fs;

module.exports = class Packet {
  constructor({ app, dir, paths, parent, package: pkg }) {
    // packageCache is necessary because there might be multiple asynchronous parsing tasks on the same package, such as `a => b` and `a => c => b`, which might return multiple package instance of `b` since neither one can find the other during the `Package.create()` call.
    const { packageCache } = app;
    if (packageCache[dir]) return packageCache[dir];
    packageCache[dir] = this;

    this.app = app;
    this.dir = dir;
    this.name = pkg.name;
    this.version = pkg.version;
    this.paths = paths || [dir];
    this.parent = parent;
    this.dependencies = {};
    this.entries = {};
    this.bundles = {};
    this.files = {};
    this.folder = {};
    this.browser = {};
    this.browserify = pkg.browserify;
    this.depPaths = [];
    this.loaderCache = {};
    this.isolated = app.bundleExcept.includes(pkg.name);

    if (!parent && pkg.babel) {
      this.transpiler = 'babel';
      this.transpilerOpts = pkg.babel;
    }

    // should prefer pkg.module but since we don't have tree shaking yet...
    const main = typeof pkg.browser == 'string' ? pkg.browser : (pkg.main || pkg.module);
    this.main = main ? main.replace(/^\.\//, '') : 'index.js';

    if (typeof pkg.browser == 'object') {
      Object.assign(this.browser, pkg.browser);
    }

    // https://github.com/foliojs/brotli.js/pull/22
    if (this.name == 'brotli') this.browser.fs = false;
  }

  static async create({ dir, parent, app }) {
    // cnpm (npminstall) dedupes dependencies with symbolic links
    dir = await realpath(dir);
    const content = await readFile(path.join(dir, 'package.json'), 'utf8');
    const data = JSON.parse(content);

    // prefer existing package to de-duplicate packages
    if (app.package) {
      const { name, version } = data;
      const pkg = app.package.find({ name, version });
      if (pkg) return pkg;
    }

    const pkg = new Packet({ dir, parent, app, package: data });
    await pkg.prepare();
    return pkg;
  }

  get rootPackage() {
    let pkg = this;
    while (pkg.parent) pkg = pkg.parent;
    return pkg;
  }

  get bundle() {
    const { bundles, main } = this;
    return bundles[main] || null;
  }

  get all() {
    const iterable = { done: new WeakMap() };
    iterable[Symbol.iterator] = function * () {
      if (!iterable.done.has(this)) yield this;
      iterable.done.set(this, true);
      for (const dep of Object.values(this.dependencies)) {
        if (iterable.done.has(dep)) continue;
        yield* Object.assign(dep.all, { done: iterable.done });
      }
    }.bind(this);
    return iterable;
  }

  /**
   * Find package by name or by name and version in the package tree.
   * @param {Object} opts
   * @param {string} opts.name
   * @param {string} opts.version
   * @returns {Package}
   */
  find({ name, version }) {
    if (!name) return this;

    for (const pkg of this.all) {
      if (name == pkg.name) {
        if (!version || pkg.version == version) return pkg;
      }
    }
  }

  findAll({ name }) {
    const result = [];

    if (!name) return result;
    for (const pkg of this.all) {
      if (name == pkg.name) result.push(pkg);
    }

    return result;
  }

  async parseDepPaths() {
    const { depPaths } = this;
    let pkg = this;

    while (pkg) {
      const depPath = path.join(pkg.dir, 'node_modules');
      if (existsSync(depPath) && !depPaths.includes(depPath)) {
        depPaths.push(depPath);
      }
      pkg = pkg.parent;
    }
  }

  async prepare() {
    await this.parseDepPaths();
    const { name, transpiler, app, main } = this;

    if (this === app.package && !transpiler) {
      const obj = { babel: '.babelrc', typescript: 'tsconfig.json' };
      for (const prop in obj) {
        const configPath = path.join(this.dir, obj[prop]);
        if (existsSync(configPath)) {
          this.transpiler = prop;
          const content = await readFile(configPath, 'utf8');
          try {
            this.transpilerOpts = JSON.parse(content);
          } catch (err) {
            throw new Error(`${err.message} (${configPath})`);
          }
          break;
        }
      }
    }

    if (app.transpile.only.includes(name) && !transpiler) {
      this.transpiler = app.package.transpiler;
      this.transpilerOpts = app.package.transpilerOpts;
    }

    this.extensions = [
      '.js', '.jsx', '/index.js', '/index.jsx',
      '.ts', '.tsx', '/index.ts', '/index.tsx',
    ];

    const [ fpath ] = await this.resolve(this.normalizeFile(main));
    if (fpath) this.main = path.relative(this.dir, fpath);

    if (process.env.NODE_ENV !== 'production' && (!this.parent || this.transpiler) && !this.watchers) {
      this.watchers = this.paths.map(dir => {
        debug('watching %s', dir);
        const watchOpts = {
          persistent: false,
          // https://nodejs.org/api/fs.html#fs_fs_watch_filename_options_listener
          recursive: process.platform !== 'linux',
        };
        return watch(dir, watchOpts, this.watch.bind(this));
      });
    }
  }

  watch(eventType, filename) {
    if (filename && filename in this.files) {
      this.reload(eventType, filename)
        .catch(err => console.error(err.stack));
    }
  }

  async reload(eventType, filename) {
    const mod = this.files[filename];
    const { app } = this;
    const { dest } = app.cache;
    const purge = id => {
      const fpath = path.join(dest, id);
      debug('purge cache %s', fpath);
      return fs.unlink(fpath).catch(() => {});
    };

    // the module might be `opts.lazyload`ed
    await purge(mod.id);

    if (this.parent) {
      // packages isolated with `opts.bundleExcept` or by other means
      await Promise.all(Object.values(this.entries).map(m => purge(m.id)));
    } else {
      // components (which has no parent) might be accessed without `${name}/${version}`
      await purge(mod.file);
    }

    // css bundling is handled by postcss-import, which won't use {@link Module@cache}.
    const ext = path.extname(filename);
    for (const entry of app.entries.filter(file => file.endsWith(ext))) {
      const entryModule = app.package.entries[entry];
      for (const descendent of entryModule.family) {
        if (mod == descendent) {
          if (entry.endsWith('.css')) await entryModule.reload();
          await purge(entryModule.id);
          break;
        }
      }
    }

    // if the root module is not treated as `entries`, try traversing up
    let ancestor = mod;
    // the dependency graph might be cyclic
    let retries = 20;
    while (ancestor.parent && retries--) ancestor = ancestor.parent;
    await purge(ancestor.id);

    if (!mod.file.endsWith('.css')) {
      await mod.reload();
    }
  }

  tryRequire(name) {
    for (const depPath of this.depPaths) {
      try {
        return require(path.join(depPath, name));
      } catch (err) {
        // ignored
      }
    }
    console.error(new Error(`Cannot find module ${name} (${this.dir})`));
  }

  normalizeFile(file) {
    const { browser } = this;

    // "browser" mapping in package.json
    file = (browser[`./${file}`] || browser[`./${file}.js`] || file).replace(/^[\.\/]+/, '');

    // if the mapped result is empty, default to index.js
    if (!file) file = 'index.js';

    // explicit directory require
    if (file.endsWith('/')) file += 'index.js';

    // extension duduction
    if (!['.css', '.js', '.jsx', '.ts', '.tsx', '.json', '.wasm'].includes(path.extname(file))) {
      file += '.js';
    }

    return file;
  }

  async parseModule(file) {
    const { files, folder, name } = this;
    const originFile = file;
    file = this.normalizeFile(file);

    // if parsed already
    if (file in files) return files[file];

    const [fpath, suffix] = await this.resolve(file);

    if (fpath) {
      const fullPath = (await glob(fpath, { nocase: true, cwd: this.dir}))[0];
      if (fpath !== fullPath) {
        const err = new Error(`unable to fully resolve ${file} in ${name}, case mismatch (${fullPath})`);
        console.warn(err.stack);
      }

      if ([ '.ts', '.tsx' ].includes(suffix)) {
        file = file.replace(/\.\w+$/, suffix);
      }
      else if (suffix.includes('/index')) {
        file = file.replace(/\.\w+$/, suffix);
        folder[originFile] = true;
      }

      // There might be multiple resolves on same file.
      if (file in files) return files[file];
      const mod = Module.create({ file, fpath, pkg: this });
      return mod;
    }
  }

  async parseEntry(entry) {
    // entry is '' when `require('foo/')`, should fallback to `this.main`
    if (!entry) entry = this.module || this.main;
    const { app, dir, entries, files } = this;
    const mod = await this.parseModule(entry);

    if (!mod) throw new Error(`unknown entry ${entry} (${dir})`);
    entries[mod.file] = files[mod.file] = mod;
    if (this === app.package) app.entries = Object.keys(entries);

    await mod.parse();
    return mod;
  }

  async parseFile(file) {
    const { files } = this;
    const mod = await this.parseModule(file);

    if (mod) {
      files[mod.file] = mod;
      await mod.parse();
      return mod;
    }
  }

  /**
   * Parse an entry that has code or deps (or both) specified already.
   * @param {Object} opts
   * @param {string} opts.entry
   * @param {string[]} opts.deps
   * @param {string} opts.code
   */
  async parseFakeEntry({ entry, deps, code }) {
    const { entries, files, paths } = this;
    const { moduleCache } = this.app;
    const fpath = path.join(paths[0], entry);
    delete moduleCache[fpath];
    const mod = Module.create({ file: entry, fpath, pkg: this });

    Object.assign(mod, { deps, code, fake: true });
    entries[mod.file] = files[mod.file] = mod;
    await mod.parse();
    return mod;
  }

  async parsePackage({ name, entry }) {
    if (this.dependencies[name]) {
      const pkg = this.dependencies[name];
      return await pkg.parseEntry(entry);
    }

    for (const depPath of this.depPaths) {
      const dir = path.join(depPath, name);
      if (existsSync(dir)) {
        const { app } = this;
        const pkg = await Packet.create({ dir, parent: this, app });
        this.dependencies[pkg.name] = pkg;
        return await pkg.parseEntry(entry);
      }
    }
  }

  async resolve(file) {
    const [, fname, ext] = file.match(/^(.*?)(\.(?:\w+))$/);
    const suffixes = /\.[jt]sx?$/.test(ext) ? this.extensions : [ext];

    for (const dir of this.paths) {
      for (const suffix of suffixes) {
        const fpath = path.join(dir, `${fname}${suffix}`);
        if (existsSync(fpath) && (await lstat(fpath)).isFile()) {
          return [fpath, suffix];
        }
      }
    }

    return [];
  }

  get lock() {
    const lock = this.app.lock
      ? JSON.parse(JSON.stringify(this.app.lock))
      : {};

    for (const pkg of this.all) {
      const { name, version,  } = pkg;
      const copies = lock[name] || (lock[name] = {});
      copies[version] = { ...copies[version], ...pkg.copy };
    }

    return lock;
  }

  get copy() {
    const copy = { manifest: {} };
    const { dependencies, main, bundles, parent, entries } = this;

    for (const file in bundles) {
      if (file.endsWith('.css')) continue;
      if (!parent && entries[file] && !entries[file].isPreload) continue;
      copy.manifest[file] = bundles[file].output;
    }

    if (!/^(?:\.\/)?index(?:.js)?$/.test(main)) copy.main = main;

    for (const name of ['folder', 'browser']) {
      const obj = this[name];
      if (Object.keys(obj).length > 0)  {
        copy[name] = { ...copy[name], ...obj };
      }
    }

    if (dependencies && Object.keys(dependencies).length > 0) {
      if (!copy.dependencies) copy.dependencies = {};
      for (const dep of Object.values(dependencies)) {
        copy.dependencies[dep.name] = dep.version;
      }
    }

    return copy;
  }

  get loaderConfig() {
    const { app, name, version, main } = this;
    const { baseUrl, map, timeout } = app;
    const preload = name == app.package.name ? app.preload : [];

    return {
      baseUrl,
      map,
      preload,
      package: { name, version, main },
      timeout,
    };
  }

  async parseLoader(loaderConfig) {
    const fpath = path.join(__dirname, '..', 'loader.js');
    const code = await readFile(fpath, 'utf8');

    return new Promise(resolve => {
      const stream = looseEnvify(fpath, {
        BROWSER: true,
        NODE_ENV: process.env.NODE_ENV || 'development',
        loaderConfig
      });
      let buf = '';
      stream.on('data', chunk => buf += chunk);
      stream.on('end', () => resolve(buf));
      stream.end(code);
    });
  }

  /**
   * Fix source map related settings in both code and map.
   * @param {Object} opts
   * @param {string} opts.file
   * @param {string} opts.code
   * @param {Object|SourceMapGenerator} opts.map
   */
  setSourceMap({ output, code, map }) {
    code = output.endsWith('.js')
      ? `${code}\n//# sourceMappingURL=${path.basename(output)}.map`
      : `${code}\n/*# sourceMappingURL=${path.basename(output)}.map */`;

    if (map instanceof SourceMapGenerator) map = map.toJSON();
    if (typeof map == 'string') map = JSON.parse(map);

    map.sources = map.sources.map(source => source.replace(/^\//, ''));
    map.sourceRoot = this.app.source.root;

    return { code, map };
  }

  async compileAll(opts) {
    const { entries } = this;

    for (const entry in entries) {
      if (entry.endsWith('.js') && entries[entry].isRootEntry) {
        await this.compile(entry, opts);
      }
    }

    await this.compile([], opts);
  }

  async compile(entries, opts) {
    if (!Array.isArray(entries)) entries = [entries];
    opts = { package: true, writeFile: true, ...opts };
    const { manifest = {} } = opts;

    // compile({ entry: 'fake/entry', deps, code }, opts)
    if (typeof entries[0] == 'object') {
      await this.parseFakeEntry(entries[0]);
      entries[0] = entries[0].entry;
    }

    const { name, version } = this;
    const { dest } = this.app;
    const mod = this.files[entries[0]];
    const bundle = new Bundle({ ...opts, packet: this, entries });
    const { entry } = bundle;

    debug(`compile ${name}/${version}/${entry} start`);

    const result = await bundle.minify();
    const { code, map } = this.setSourceMap({ output: bundle.output, ...result });

    if (!this.parent) manifest[entry] = bundle.output;

    if (mod && mod.fake) {
      delete this.files[mod.file];
      delete this.entries[mod.file];
    }

    if (!opts.writeFile) return { code, map };

    const fpath = this.parent
      ? path.join(dest, name, version, bundle.output)
      : path.join(dest, bundle.output);

    await mkdirp(path.dirname(fpath));
    await Promise.all([
      writeFile(fpath, code),
      writeFile(`${fpath}.map`, JSON.stringify(map, (k, v) => {
        if (k !== 'sourcesContent') return v;
      }))
    ]);
    debug(`compile ${name}/${version}/${entry} end`);
  }

  async destroy() {
    if (Array.isArray(this.watchers)) {
      for (const watcher of this.watchers) watcher.close();
    }
  }
};
