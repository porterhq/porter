'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const util = require('util');
const UglifyJS = require('uglify-js');
const { SourceMapConsumer, SourceMapGenerator, SourceNode } = require('source-map');
const debug = require('debug')('porter');
const Module = require('./module');
const { EXTENSION_MAP } = require('./constants');

const rExt = /(\.\w+)?$/;

const DEPTH_FIRST = 0;
const BREATH_FIRST = 1;

function getEntry(packet, entries) {
  return entries && (entries.length === 1 || !packet.parent) ? entries[0] : packet.main;
}

module.exports = class Bundle {
  #entries = null;
  #code = null;
  #map = null;
  #cacheKey = null;
  #contenthash = null;
  #reloading = null;
  #loaderCache = {};
  #obtainCache = {};

  static wrap(options = {}) {
    const { packet, entries } = options;
    // the default bundle
    const bundle = Bundle.create(options);
    const results = [ bundle ];
    const entry = packet.files[entries[0]];

    if (!entry) return results;
    if (bundle.format === '.css') {
      for (const mod of Object.values(packet.entries)) {
        if (mod.file !== entry.file && mod.file.replace(rExt, '.css') === entry.file) {
          entries.push(mod.file);
          break;
        }
      }
      for (const file of entries) {
        if (!bundle.entries.includes(file)) bundle.entries.push(file);
      }
      return results;
    }

    const cssExtensions = EXTENSION_MAP['.css'];
    let cssImports = false;
    for (const mod of entry.immediateFamily) {
      // import './foo.css';
      if (cssExtensions.includes(path.extname(mod.file))) {
        cssImports = true;
        break;
      }
    }
    if (cssImports) {
      const cssBundle = Bundle.create({ packet, entries, format: '.css' });
      // existing css bundle might not contain all of the css dependencies
      for (const file of entries) {
        if (!cssBundle.entries.includes(file)) cssBundle.entries.push(file);
      }
      results.unshift(cssBundle);
    }

    for (const mod of entry.dynamicFamily) {
      // import(specifier);
      const depBundles = Bundle.wrap({
        packet: mod.packet,
        entries: [ mod.file ],
        loader: false,
      });
      for (const depBundle of depBundles) {
        depBundle.parent = bundle;
        bundle.children.push(depBundle);
        results.unshift(depBundle);
      }
    }

    return results;
  }

  static create(options = {}) {
    const { packet, entries } = options;
    const ext = entries && path.extname(entries[0] || '');

    let { format } = options;
    if (!format && ext) {
      for (const [ key, extensions ] of Object.entries(EXTENSION_MAP)) {
        if (extensions.includes(ext)) format = key;
      }
    }

    const { bundles } = packet;
    const entry = getEntry(packet, entries);
    const outkey = format === '.css' ? entry.replace(rExt, '.css') : entry;

    let bundle = bundles[outkey];
    if (!bundle) {
      bundle = new Bundle({ ...options, format });
      bundles[outkey] = bundle;
    }

    return bundle;
  }

  constructor(options = {}) {
    const { packet, entries, format = '.js' } = options;
    const { app } = packet;

    this.parent = null;
    this.children = [];
    this.app = app;
    this.packet = packet;
    this.#entries = entries && entries.length > 0 ? [].concat(entries) : null;
    this.#loaderCache = {};

    let scope = 'packet';
    if (options.package === false) {
      scope = 'module';
    } else if (app.preload.length > 0 || options.all || format === '.css') {
      scope = 'all';
    }
    this.scope = scope;
    this.format = format;

    const mod = entries && entries.length > 0 ? packet.files[entries] : null;
    const { loader, loaderConfig } = options;
    this.loaderConfig = loaderConfig;
    this.loader = loader == null && mod ? mod.isRootEntry : loader === true;
  }

  /**
   * Traverse all the bundled modules. Following modules will be skipped over:
   * - module is just a placeholder object generated by {@link FakePacket}
   * - module is preloaded but the ancestor isn't one of the preload entry
   * - module is one of the bundle exceptions
   */
  * [Symbol.iterator]() {
    return yield* this.iterate({ mode: DEPTH_FIRST });
  }

  * iterate({ mode = DEPTH_FIRST } = {}) {
    const { entries, packet, scope, format } = this;
    const extensions = EXTENSION_MAP[format];
    const done = {};

    function* iterate(entry, preload) {
      // remote modules don't have children locally
      if (!entry.children) return;
      const children = [ ...entry.children ];
      if (mode === BREATH_FIRST) children.reverse();
      for (const mod of children) {
        if (done[mod.id]) continue;
        if (entry.dynamicChildren?.includes(mod)) continue;
        if (format === '.js') {
          // exclude external modules if module packet is isolated
          if (mod.packet !== packet && scope !== 'all') continue;
          if (mod.preloaded && !preload) continue;
          if (mod.packet !== packet && mod.packet.isolated && !preload) continue;
        }
        // might be WasmModule or web worker
        if (mod.isolated || (format === '.js' && mod.isRootEntry)) continue;
        yield* iterateEntry(mod, preload);
      }
    }

    function* iterateEntry(entry, preload = null) {
      done[entry.id] = true;
      if (mode === DEPTH_FIRST) yield* iterate(entry, preload);
      if (extensions.includes(path.extname(entry.file))) {
        if (!(entry.packet.isolated && preload && entry.packet !== preload?.packet)) {
          yield entry;
        }
      } else if (format === '.js' && entry.exports) {
        yield entry.exports; // css modules
      }
      if (mode === BREATH_FIRST) yield* iterate(entry, preload);
    }

    for (const name of entries.sort()) {
      const entry = packet.files[name];
      if (!entry) throw new Error(`unparsed entry ${name} (${packet.dir})`);
      // might be a mocked module from FakePacket
      if (!(entry instanceof Module)) continue;
      // lazyloaded module
      if (scope === 'module') return yield entry;

      /**
       * preloaded modules should be included in following scenarios:
       * - bundling preload.js itself
       * - bundling a program generated entry that needs to be self contained
       * - bundling a web worker
       */
      const preload = entry.isPreload || entry.fake || entry.isWorker ? entry : null;
      yield* iterateEntry(entry, preload);
    }
  }

  get entries() {
    if (this.#entries) return this.#entries;

    const { entries } = this.packet;
    const extensions = EXTENSION_MAP[this.format];
    return Object.keys(entries).filter(file => {
      return extensions.includes(path.extname(file)) && !entries[file].isRootEntry;
    });
  }

  set entries(files) {
    this.#entries = files;
  }

  get entry() {
    const { packet } = this;
    return getEntry(packet, this.#entries);
  }

  get entryPath() {
    const { entry, packet } = this;
    const { name, version } = packet;
    return packet.parent ? path.join(name, version, entry) : entry;
  }

  get outkey() {
    const { entry, format } = this;
    return format === '.css' ? entry.replace(rExt, format) : entry;
  }

  get output() {
    const { entries } = this;
    const code = this.#code;
    if (entries.length === 0 || code == null) return '';
    const { entry, contenthash, format } = this;
    return entry.replace(rExt, `.${contenthash}${format}`);
  }

  get contenthash() {
    const code = this.#code;
    if (code == null) return '';
    if (!this.#contenthash) {
      this.#contenthash = crypto.createHash('md5').update(code).digest('hex').slice(0, 8);
    }
    return this.#contenthash;
  }

  get outputPath() {
    const { output, packet } = this;
    const { name, version } = packet;
    return packet.parent ? path.join(name, version, output) : output;
  }

  async createSourceNode({ source, sourceContent, code, map }) {
    if (map instanceof SourceMapGenerator) {
      map = map.toJSON();
    }

    if (map) {
      const consumer = await new SourceMapConsumer(map);
      const node = SourceNode.fromStringWithSourceMap(code, consumer);
      if (sourceContent) node.setSourceContent(source, sourceContent);
      return node;
    }

    // Source code need to be mapped line by line to debug in devtools.
    // return new SourceNode(1, 0, source, code);
    const lines = code.split('\n');
    const node = new SourceNode();
    for (let i = 0; i < lines.length; i++) {
      node.add(new SourceNode(i + 1, 0, source, lines[i]));
    }
    if (sourceContent) node.setSourceContent(source, sourceContent);
    return node.join('\n');
  }

  async obtainLoader(loaderConfig) {
    const { code, sourceContent } = await this.packet.parseLoader(loaderConfig);
    return {
      source: 'porter:///loader.js',
      sourceContent,
      code,
    };
  }

  async minifyLoader(loaderConfig = {}) {
    const loaderCache = this.#loaderCache;
    const cacheKey = JSON.stringify(loaderConfig);
    if (loaderCache[cacheKey]) return loaderCache[cacheKey];
    const { code, sourceContent } = await this.packet.parseLoader(loaderConfig);
    const source = 'porter:///loader.js';
    const result = UglifyJS.minify({ [source]: code }, {
      compress: { dead_code: true },
      output: { ascii_only: true },
      ie8: true
    });
    if (result.error) throw result.error;
    result.source = source;
    result.sourceContent = sourceContent;
    return (loaderCache[cacheKey] = result);
  }

  /**
   * check if bundle cache is stale
   * @returns {boolean}
   */
  revalidate() {
    if (!this.#cacheKey) return true;
    const { entries: cacheEntries } = JSON.parse(this.#cacheKey);
    const { entries } = this;
    if (cacheEntries.length !== entries.length) return true;
    for (let i = 0; i < entries.length; i++) {
      if (cacheEntries[i] !== entries[i]) return true;
    }
    return false;
  }

  async reload(options) {
    if (this.#reloading) clearTimeout(this.#reloading);
    this.#reloading = setTimeout(() => this._reload(options), 100);
  }

  async _reload({ cause } = {}) {
    const { app, entryPath, outputPath } = this;
    if (!outputPath) return;
    const reason = cause ? `(${cause.entryPath})` : '';
    debug(`reloading ${entryPath} -> ${outputPath}`, reason);
    await fs.unlink(path.join(app.cache.path, outputPath)).catch(() => {});
    this.#code = null;
    this.#map = null;
    this.#cacheKey = null;
    this.#contenthash = null;
    this.#obtainCache = {};
  }

  async getEntryModule({ minify = false } = {}) {
    const { packet, format, entries } = this;
    const mod = packet.files[entries[0]];

    if (!mod && format === '.js') {
      const { name, version } = packet;
      throw new Error(`unable to find ${entries[0]} in packet ${name} v${version}`);
    }

    if (mod.isRootEntry) {
      // dependencies generated at the transpile phase might not be packed yet
      for (const dep of packet.all) {
        if (dep !== packet && dep.bundleable) await dep.pack({ minify });
      }
    }

    return mod;
  }

  async obtain(options = {}) {
    const { entries } = this;
    const { minify } = options;
    const cacheKey  = JSON.stringify({ entries, minify });

    if (this.#cacheKey === cacheKey) {
      return { code: this.#code, map: this.#map };
    }

    const task = this.#obtainCache[cacheKey];
    return task || (this.#obtainCache[cacheKey] = this._obtain(options));
  }

  /**
   * Create a bundle from specified entries
   * @param {string[]} entries
   * @param {Object} opts
   * @param {boolean} opts.loader   include the loader when entry is root entry, set to false to explicitly exclude the loader
   * @param {Object} opts.loaderConfig overrides {@link Packet#loaderConfig}
   */
  async _obtain({ minify = false } = {}) {
    const { app, entries, children, packet, format, loader } = this;
    const cacheKey = JSON.stringify({ entries, minify });

    if (format === '.wasm') {
      for (const mod of this) {
        const result = minify ? await mod.minify() : await mod.obtain();
        this.#code = result.code;
        this.updatedAt = new Date();
        const { entryPath, outputPath } = this;
        debug('bundle complete %s -> %s', entryPath, outputPath, entries);
        return result;
      }
    }

    const node = new SourceNode();
    const loaderConfig = Object.assign(packet.loaderConfig, this.loaderConfig);

    for (const mod of this.iterate({ mode: BREATH_FIRST })) {
      const { code, map } = minify ? await mod.minify() : await mod.obtain();
      const subnode = await this.createSourceNode({
        source: `porter:///${path.relative(app.root, mod.fpath)}`,
        sourceContent: mod.code || await fs.readFile(mod.fpath, 'utf-8'),
        code,
        map,
      });
      node.prepend(subnode);
    }

    const mod = await this.getEntryModule({ minify });

    if (mod.isRootEntry && !mod.isPreload && format === '.js') {
      await Promise.all(children.map(child => child.obtain({ minify })));
      node.prepend(`porter.merge(porter.lock, ${JSON.stringify(mod.lock)})`);
    }

    if (mod.isRootEntry && loader !== false && format === '.js') {
      // bundle with loader unless turned off specifically
      const result = minify
        ? await this.minifyLoader(loaderConfig)
        : await this.obtainLoader(loaderConfig);
      node.prepend(await this.createSourceNode(result));
      node.add(`porter["import"](${JSON.stringify(mod.id)})`);
    }

    const result = node.join('\n').toStringWithSourceMap();
    this.#code = result.code;
    this.#map = result.map;
    this.#cacheKey = cacheKey;
    this.#contenthash = null;
    this.#obtainCache[cacheKey] = null;
    this.updatedAt = new Date();

    const { entryPath, outputPath } = this;
    debug('bundle complete %s -> %s', entryPath, outputPath, entries, { loader, minify });
    return result;
  }

  /**
   * Fuzzy obtain code without source map
   * @param {Object}  options
   * @param {boolean} options.loader
   * @param {boolean} options.minify
   */
  async fuzzyObtain({ loader, minify = false } = {}) {
    const { children, packet, format } = this;
    const loaderConfig = Object.assign(packet.loaderConfig, this.loaderConfig);
    const chunks = [];

    for (const mod of this.iterate({ mode: BREATH_FIRST })) {
      const { code } = minify ? await mod.minify() : await mod.obtain();
      chunks.unshift(code);
    }

    const mod = await this.getEntryModule({ minify });

    if (mod.isRootEntry && !mod.isPreload && format === '.js') {
      await Promise.all(children.map(child => child.fuzzyObtain({ minify })));
      chunks.unshift(`porter.merge(porter.lock, ${JSON.stringify(mod.lock)})`);
    }

    if (mod.isRootEntry && loader !== false && format === '.js') {
      // bundle with loader unless turned off specifically
      const { code } = minify
        ? await this.minifyLoader(loaderConfig)
        : await this.obtainLoader(loaderConfig);
      chunks.unshift(code);
      chunks.push(`porter["import"](${JSON.stringify(mod.id)})`);
    }

    const code = (this.#code = chunks.join('\n'));
    return { code };
  }

  async exists({ minify = true } = {}) {
    const { app } = this;
    if (typeof app.bundle.exists !== 'function') return false;
    await this.fuzzyObtain({ minify });
    return await app.bundle.exists(this);
  }

  async minify() {
    return await this.obtain({ minify: true });
  }

  /**
   * Fix source map related settings in both code and map.
   * @param {Object} result
   * @param {string} result.code
   * @param {Object|SourceMapGenerator} result.map
   * @param {Bundle} bundle
   * @param {string} bundle.outputPath
   */
   setSourceMap({ code, map }, bundle) {
    if (!map) return { code, map };

    // normalize map
    if (map instanceof SourceMapGenerator) map = map.toJSON();
    if (typeof map == 'string') map = JSON.parse(map);

    const { app } = this;
    if (app.source.inline !== true) {
      map.sourceRoot = app.source.root;
      map.sources = map.sources.map(source => source.replace(/^porter:\/\/\//, ''));
      map.sourcesContent = undefined;
    }

    const sourceMappingURL = app.source.mappingURL
      ? `${app.source.mappingURL}${bundle.outputPath}.map`
      : `${path.basename(bundle.outputPath)}.map`;
    code = bundle.outputPath.endsWith('.js')
      ? `${code}\n//# sourceMappingURL=${sourceMappingURL}`
      : `${code}\n/*# sourceMappingURL=${sourceMappingURL} */`;

    return { code, map };
  }

  async compile(options = {}) {
    const { manifest = {}, writeFile = true } = options;
    if (await this.exists()) {
      const { entryPath, outputPath } = this;
      manifest[this.outkey] = this.output;
      debug('bundle exists %s -> %s', entryPath, outputPath, this.entries);
      return;
    }

    // compile dependencies first
    for (const child of this.children) await child.compile({ manifest });

    const result = await this.minify();
    const { app, outputPath } = this;
    if (!outputPath) {
      throw new Error(util.format('bundle empty %s %j', this.entryPath, this.entries));
    }

    manifest[this.outkey] = this.output;
    const { code, map } = this.setSourceMap(result, this);
    if (!writeFile) return { code, map };
    const fpath = path.join(app.output.path, outputPath);
    await fs.mkdir(path.dirname(fpath), { recursive: true });
    await Promise.all([
      fs.writeFile(fpath, code),
      map ? fs.writeFile(`${fpath}.map`, JSON.stringify(map)) : Promise.resolve(),
    ]);
  }
};
