'use strict';

const debug = require('debug')('porter');
const { existsSync, watch, promises: fs } = require('fs');
const looseEnvify = require('loose-envify');
const path = require('path');
const { SourceMapGenerator } = require('source-map');
const util = require('util');

const glob = util.promisify(require('glob'));
const Module = require('./module');
const CssModule = require('./css_module');
const LessModule = require('./less_module');
const JsModule = require('./js_module');
const TsModule = require('./ts_module');
const JsonModule = require('./json_module');
const WasmModule = require('./wasm_module');
const Stub = require('./stub');
const Bundle = require('./bundle');
const { MODULE_LOADED } = require('./constants');

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
      return opts.file.endsWith('.d.ts') ? new Stub(opts) : new TsModule(opts);
    case '.tsx':
      return new TsModule(opts);
    case '.js':
    case '.jsx':
      return new JsModule(opts);
    case '.less':
      return new LessModule(opts);
    default:
      return new Stub(opts);
  }
};

const { lstat, readFile, realpath, writeFile } = fs;

module.exports = class Packet {
  constructor({ app, dir, paths, parent, packet, alias } = {}) {
    // packetCache is necessary because there might be multiple asynchronous parsing tasks on the same packet, such as `a => b` and `a => c => b`, which might return multiple packet instance of `b` since neither one can find the other during the `packet.create()` call.
    const { packetCache } = app;
    if (packetCache[dir]) return packetCache[dir];
    packetCache[dir] = this;

    Object.defineProperties(this, {
      app: {
        value: app,
        configurable: true,
        enumerable: false,
      },
      loaderCache: {
        value: {},
        configurable: true,
        enumerable: false,
      },
    });
    this.dir = dir;
    this.name = packet.name;
    this.version = packet.version;
    this.paths = paths || [dir];
    this.parent = parent;
    this.dependencies = {};
    this.entries = {};
    this.bundles = {};
    this.files = {};
    this.folder = {};
    this.browser = {};
    this.browserify = packet.browserify;
    this.depPaths = [];
    this.isolated = app.bundle.exclude.includes(packet.name);
    this.alias = alias || {};

    if (!parent && packet.babel) {
      this.transpiler = 'babel';
      this.transpilerOpts = packet.babel;
    }

    // should prefer packet.module but since we don't have tree shaking yet...
    const main = typeof packet.browser == 'string' ? packet.browser : (packet.main || packet.module);
    this.main = main ? main.replace(/^\.\//, '') : 'index.js';

    if (typeof packet.browser == 'object') {
      Object.assign(this.browser, packet.browser);
    }

    // https://github.com/foliojs/brotli.js/pull/22
    if (this.name == 'brotli') this.browser.fs = false;
  }

  static async create({ dir, parent, app }) {
    // cnpm (npminstall) dedupes dependencies with symbolic links
    dir = await realpath(dir);
    const content = await readFile(path.join(dir, 'package.json'), 'utf8');
    const data = JSON.parse(content);

    // prefer existing packet to de-duplicate packets
    if (app.packet) {
      const { name, version } = data;
      const packet = app.packet.find({ name, version });
      if (packet) return packet;
    }

    const packet = new Packet({ dir, parent, app, packet: data });
    await packet.prepare();
    return packet;
  }

  get rootPacket() {
    let packet = this;
    while (packet.parent) packet = packet.parent;
    return packet;
  }

  get bundle() {
    const { bundles, main } = this;
    return bundles[main] || null;
  }

  /**
   * check if packet should be bundled and were not bundled yet
   * @returns {boolean}
   */
  get bundleable() {
    const { app, bundles, isolated } = this;
    return (app.preload.length === 0 || isolated) && Object.keys(bundles).length === 0;
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
   * Find packet by name or by name and version in the packet tree.
   * @param {Object} opts
   * @param {string} opts.name
   * @param {string} opts.version
   * @returns {Packet}
   */
  find({ name, version }) {
    if (!name) return this;

    for (const packet of this.all) {
      if (name == packet.name) {
        if (!version || packet.version == version) return packet;
      }
    }
  }

  findAll({ name }) {
    const result = [];

    if (!name) return result;
    for (const packet of this.all) {
      if (name == packet.name) result.push(packet);
    }

    return result;
  }

  async parseDepPaths() {
    const { depPaths } = this;
    let packet = this;

    while (packet) {
      const depPath = path.join(packet.dir, 'node_modules');
      if (existsSync(depPath) && !depPaths.includes(depPath)) {
        depPaths.push(depPath);
      }
      packet = packet.parent;
    }
  }

  async findTranspiler() {
    if (this.transpiler) return;
    const obj = {
      babel: ['babel.config.js', '.babelrc'],
      typescript: 'tsconfig.json',
    };
    const configMappers = [];
    for (const key in obj) {
      const value = obj[key];
      if (Array.isArray(value)) {
        for (const config of value) {
          configMappers.push({
            transpiler: key,
            config,
          });
        }
      } else {
        configMappers.push({
          transpiler: key,
          config: value,
        });
      }
    }

    outer: for (const dir of this.paths.concat(this.dir)) {
      for (const configObj of configMappers) {
        const configPath = path.join(dir, configObj.config);
        if (!existsSync(configPath)) continue;
        if (path.extname(configObj.config) === '.js') {
          this.transpiler = configObj.transpiler;
          // cache 用于兼容 babel.config.js 中 api.cache 调用
          this.transpilerOpts = require(configPath)({ cache: () => {} });
        } else {
          const content = await readFile(configPath, 'utf8').catch(() => '');
          if (!content) continue;
          try {
            this.transpiler = configObj.transpiler;
            this.transpilerOpts = JSON.parse(content);
          } catch (err) {
            throw new Error(`${err.message} (${configPath})`);
          }
        }
        break outer;
      }
    }
  }

  async prepareTranspiler() {
    await this.findTranspiler();

    if (this.transpiler === 'babel') {
      const babel = this.tryRequire('@babel/core/package.json');
      this.transpilerVersion = babel && babel.version;
    } else if (this.transpiler === 'typescript') {
      const ts = this.tryRequire('typescript/package.json');
      this.transpilerVersion = ts && ts.version;
    }

    if (this.transpiler === 'babel') {
      const { plugins = [] } = this.transpilerOpts;
      const pluginPath = path.join(__dirname, 'babel_plugin.js');
      if (!plugins.includes(pluginPath)) {
        plugins.push(pluginPath);
        this.transpilerOpts.plugins = plugins;
      }
    }
  }

  async prepare() {
    await this.parseDepPaths();
    const { name, transpiler, app, main } = this;

    if (this === app.packet) await this.prepareTranspiler();

    if (app.transpile.include.includes(name) && !transpiler) {
      this.transpiler = app.packet.transpiler;
      this.transpilerOpts = app.packet.transpilerOpts;
    }

    const [ fpath ] = await this.resolve(this.normalizeFile(main));
    if (fpath) this.main = path.relative(this.dir, fpath);

    if (process.env.NODE_ENV !== 'production' && (!this.parent || this.transpiler)) {
      this.watch();
    }
  }

  watch() {
    if (this.watchers) return;
    this.watchers = this.paths.map(dir => {
      debug('watching %s', dir);
      const watchOpts = {
        // https://nodejs.org/api/fs.html#fs_fs_watch_filename_options_listener
        recursive: process.platform !== 'linux',
      };

      let queue = Promise.resolve();
      return watch(dir, watchOpts, (eventType, filename) => {
        queue = queue
          .then(() => this.onChange(eventType, filename))
          .catch(err => console.error(err));
      });
    });
  }

  async onChange(eventType, filename) {
    if (filename && filename in this.files) await this.reload(eventType, filename);
  }

  async reload(eventType, filename) {
    const { files, app, bundles } = this;
    const mod = files[filename];
    const { mtime } = await fs.stat(mod.fpath).catch(() => ({ mtime: null }));
    if (mtime === null || mod.reloaded >= mtime) return;
    mod.reloaded = mtime;
    await mod.reload();

    const { bundles: rootBundles } = app.packet;
    for (const bundle of Object.values(bundles).concat(Object.values(rootBundles))) {
      for (const m of bundle) {
        if (m === mod) {
          await bundle.reload();
          break;
        }
      }
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
    console.error(new Error(`Cannot find dependency ${name} (${this.dir})`));
  }

  normalizeFile(file) {
    const { browser } = this;

    // "browser" mapping in package.json
    let result = browser[`./${file}`];
    if (result === undefined) result = browser[`./${file}.js`];
    if (result === false) return result;
    if (typeof result === 'string') file = result;

    // explicit directory require
    if (file.endsWith('/')) file += 'index';

    return file.replace(/^[\.\/]+/, '');
  }

  async parseModule(file) {
    const { files, folder, name, alias } = this;

    // alias takes precedence over original specifier
    for (const key in alias) {
      if (file.startsWith(key)) {
        file = alias[key] + file.slice(key.length);
        break;
      }
    }

    const originFile = file;
    file = this.normalizeFile(file);

    // if neglected in browser field
    if (file === false) return false;
    // if parsed already
    if (files.hasOwnProperty(file)) return files[file];

    const [fpath, suffix] = await this.resolve(file);

    if (fpath) {
      const fullPath = (await glob(fpath, { nocase: true, cwd: this.dir }))[0];
      if (fpath !== fullPath) {
        const err = new Error(`unable to fully resolve ${file} in ${name}, case mismatch (${fullPath})`);
        console.warn(err.stack);
      }

      // ignore d.ts
      if (fpath.endsWith('.d.ts')) return false;

      file += suffix;
      if (suffix.startsWith('/index')) folder[originFile] = true;
      // There might be multiple resolves on same file.
      if (file in files) return files[file];

      const mod = Module.create({ file, fpath, packet: this });
      return mod;
    }
  }

  async parseEntry(entry) {
    // entry is '' when `require('foo/')`, should fallback to `this.main`
    if (!entry) entry = this.module || this.main;
    const { app, dir, entries, files } = this;
    const mod = await this.parseModule(entry);

    // if neglected in alias
    if (mod === false) return mod;
    if (!mod) throw new Error(`unknown entry ${entry} (${dir})`);

    entries[mod.file] = files[mod.file] = mod;
    if (this === app.packet) app.entries = Object.keys(entries);

    await mod.parse();
    return mod;
  }

  async parseFile(file) {
    const { files } = this;
    const mod = await this.parseModule(file);

    if (mod) {
      files[mod.file] = mod;
      await mod.parse();
    }

    return mod;
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
    const mod = Module.create({ file: entry, fpath, packet: this });

    Object.assign(mod, { deps, code, fake: true });
    entries[mod.file] = files[mod.file] = mod;
    await mod.parse();
    return mod;
  }

  async parsePacket({ name, entry }) {
    if (this.dependencies[name]) {
      const packet = this.dependencies[name];
      return await packet.parseEntry(entry);
    }

    for (const depPath of this.depPaths) {
      const dir = path.join(depPath, name);
      if (existsSync(dir)) {
        const { app } = this;
        const packet = await Packet.create({ dir, parent: this, app });
        this.dependencies[packet.name] = packet;
        return await packet.parseEntry(entry);
      }
    }
  }

  async resolve(file) {
    const { app, paths } = this;
    const { suffixes } = app.resolve;

    for (const dir of paths) {
      for (const suffix of suffixes) {
        const fpath = path.join(dir, `${file}${suffix}`);
        const stats = await lstat(fpath).catch(() => null);
        if (stats && stats.isFile()) return [fpath, suffix];
      }
    }

    return [];
  }

  get lock() {
    const lock = this.app.lock
      ? JSON.parse(JSON.stringify(this.app.lock))
      : {};

    for (const packet of this.all) {
      const { name, version,  } = packet;
      const copies = lock[name] || (lock[name] = {});
      copies[version] = { ...copies[version], ...packet.copy };
    }

    return lock;
  }

  get copy() {
    const copy = {};
    const manifest = {};
    const { dependencies, main, bundles, parent, entries } = this;

    for (const file in bundles) {
      if (file.endsWith('.css')) continue;
      if (!parent && entries[file] && !entries[file].isPreload) continue;
      manifest[file] = bundles[file].output;
    }

    if (Object.keys(manifest).length > 0) copy.manifest = manifest;
    if (!/^(?:\.\/)?index(?:.js)?$/.test(main)) copy.main = main;

    for (const name of ['folder', 'browser']) {
      const obj = this[name];
      const sorted = Object.keys(obj).sort().reduce((result, key) => {
        result[key] = obj[key];
        return result;
      }, {});
      if (Object.keys(obj).length > 0)  {
        copy[name] = { ...copy[name], ...sorted };
      }
    }

    if (dependencies && Object.keys(dependencies).length > 0) {
      copy.dependencies = Object.keys(dependencies).sort().reduce((result, key) => {
        result[key] = dependencies[key].version;
        return result;
      }, {});
    }

    return copy;
  }

  get loaderConfig() {
    const { app, name, version, main, alias } = this;
    const { baseUrl, map, timeout } = app;
    const preload = name == app.packet.name ? app.preload : [];

    return {
      alias,
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

  async pack({ minify = false } = {}) {
    const entries = [];
    const { app, isolated, lazyloaded, main, bundles, files } = this;

    // the modules might not be fully parsed yet, the process returns early when parsing multiple times.
    await new Promise(resolve => {
      (function poll() {
        if (Object.values(files).every(mod => mod.status >= MODULE_LOADED)) {
          resolve();
        } else {
          setTimeout(poll, 10);
        }
      })();
    });

    for (const mod of Object.values(this.files)) {
      if (mod.isRootEntry) entries.push(mod.file);
      // .wasm needs to be bundled before other entries to generate correct manifest
      if (mod.file.endsWith('.wasm')) entries.unshift(mod.file);
    }

    // if packet won't be bundled with root entries, compile as main bundle.
    if (app.preload.length === 0 || isolated || lazyloaded) entries.push(main);

    for (const entry of entries) {
      const bundle = bundles[entry] || Bundle.create({
        packet: this,
        entries: entry === main ? null : [ entry ],
      });
      if (bundle.entries.length > 0) {
        await (minify ? bundle.minify() : bundle.obtain());
      }
    }
  }

  /**
   * Fix source map related settings in both code and map.
   * @param {Object} opts
   * @param {string} opts.file
   * @param {string} opts.code
   * @param {Object|SourceMapGenerator} opts.map
   */
  setSourceMap({ output, code, map }) {
    if (!map) return { code, map };
    if (map instanceof SourceMapGenerator) map = map.toJSON();
    if (typeof map == 'string') map = JSON.parse(map);

    code = output.endsWith('.js')
      ? `${code}\n//# sourceMappingURL=${path.basename(output)}.map`
      : `${code}\n/*# sourceMappingURL=${path.basename(output)}.map */`;

    map.sources = map.sources.map(source => source.replace(/^\//, ''));
    map.sourceRoot = this.app.source.root;

    return { code, map };
  }

  async compileAll(opts) {
    const { entries, files, bundles, main } = this;

    for (const file in files) {
      if (file.endsWith('.wasm')) {
        bundles[file] = await this.compile(file, opts);
      }
    }

    for (const entry in entries) {
      if (entry.endsWith('.js') && entries[entry].isRootEntry) {
        bundles[entry] = await this.compile(entry, opts);
      }
    }

    bundles[main] = await this.compile([], opts);
  }

  async compile(entries, opts) {
    if (!Array.isArray(entries)) entries = [entries];
    opts = { package: true, writeFile: true, ...opts };
    const { manifest = {} } = opts;

    // compile({ entry: 'fake/entry', deps, code }, opts)
    if (typeof entries[0] === 'object') {
      await this.parseFakeEntry(entries[0]);
      entries[0] = entries[0].entry;
      // clear bundle cache, fake entries should always start from scratch
      this.bundles[entries[0]] = null;
    }

    const { app } = this;
    const bundle = Bundle.create({ ...opts, packet: this, entries });

    if (await bundle.exists()) {
      const { entryPath, outputPath } = bundle;
      if (!this.parent) manifest[bundle.entry] = bundle.output;
      debug('bundle exists %s -> %s', entryPath, outputPath, bundle.entries);
      return bundle;
    }

    const result = await bundle.minify();
    const mod = this.files[entries[0]];

    if (mod && mod.fake) {
      delete this.files[mod.file];
      delete this.entries[mod.file];
    }

    if (!this.parent) manifest[bundle.entry] = bundle.output;
    const { code, map } = this.setSourceMap({ output: bundle.output, ...result });
    if (!opts.writeFile) return { code, map };

    const fpath = path.join(app.output.path, bundle.outputPath);
    await fs.mkdir(path.dirname(fpath), { recursive: true });
    await Promise.all([
      writeFile(fpath, code),
      map && writeFile(`${fpath}.map`, JSON.stringify(map, (k, v) => {
        if (k !== 'sourcesContent') return v;
      })) || Promise.resolve(),
    ]);

    return bundle;
  }

  async destroy() {
    if (Array.isArray(this.watchers)) {
      for (const watcher of this.watchers) watcher.close();
    }
  }
};
