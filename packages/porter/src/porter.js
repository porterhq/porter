'use strict';

const crypto = require('crypto');
const debug = require('debug')('porter');
const { existsSync, promises: fs } = require('fs');
const mime = require('mime');
const path = require('path');
const postcss = require('postcss');
const { SourceMapGenerator } = require('source-map');

const { lstat, readFile } = fs;

const FakePacket = require('./fake_packet');
const Packet = require('./packet');

const rExt = /\.(?:css|gif|jpg|jpeg|js|png|svg|swf|ico)$/i;
const Bundle = require('./bundle');
const { MODULE_LOADED, rModuleId } = require('./constants');
const AtImport = require('./at_import');
const Cache = require('./cache');

function waitFor(mod) {
  return new Promise((resolve, reject) => {
    const { app } = mod;

    (function poll() {
      if (mod.status >= MODULE_LOADED) return resolve();
      const blockers = [];
      for (const child of mod.family) {
        if (child.status < MODULE_LOADED) {
          blockers.push(path.relative(app.root, child.fpath));
        }
      }
      debug('loading modules ... %s', blockers);
      setTimeout(poll, 1000);
    })();
  });
}

/**
 * - https://webpack.js.org/configuration/resolve/#resolvefallback
 */
const fallback = {
  fs: false,
  stream: 'readable-stream',
};

class Porter {
  #readyCache = new Map();

  constructor(opts) {
    const root = opts.root || process.cwd();
    const paths = [].concat(opts.paths == null ? 'components' : opts.paths).map(loadPath => {
      return path.resolve(root, loadPath);
    });
    const output = { path: 'public', ...opts.output };
    output.path = path.resolve(root, output.path);

    const transpile = { include: [], ...opts.transpile };
    const cachePath = path.resolve(root, opts.cache && opts.cache.path || output.path);
    const cache = new Cache({ path: cachePath });

    const bundle = { exclude: [], ...opts.bundle };
    const resolve = {
      extensions: [ '*', '.js', '.jsx', '.ts', '.tsx', '.d.ts', '.json', '.css' ],
      alias: {},
      ...opts.resolve,
      fallback: { ...fallback, ...(opts.resolve && opts.resolve.fallback) },
    };
    resolve.suffixes = resolve.extensions.reduce((result, ext) => {
      if (ext === '*') return result.concat('');
      return result.concat(ext, `/index${ext}`);
    }, []);

    Object.assign(this, { root, output, cache, transpile, bundle, resolve });
    Object.defineProperties(this, {
      moduleCache: {
        value: {},
        configurable: true,
        enumerable: false,
      },
      packetCache: {
        value: {},
        configurable: true,
        enumerable: false,
      },
      parseCache: {
        value: {},
        configurable: true,
        enumerable: false,
      },
    });

    const packet = opts.package || require(path.join(root, 'package.json'));
    const packetOptions = { alias: resolve.alias, dir: root, paths, app: this, packet };

    this.packet = opts.package
      ? new FakePacket({ ...packetOptions, lock: opts.lock })
      : new Packet(packetOptions);

    this.baseUrl = opts.baseUrl || '/';
    this.map = opts.map;
    // Ignition timeout
    this.timeout = 30000;

    this.entries = [].concat(opts.entries || []);
    this.preload = [].concat(opts.preload || []);
    this.lazyload = [].concat(opts.lazyload || []);

    this.source = { serve: false, root: '/', ...opts.source };
    this.cssTranspiler = postcss([ AtImport ].concat(opts.postcssPlugins || []));
    this.lessOptions = opts.lessOptions;
    this.uglifyOptions = opts.uglifyOptions;
  }

  ready(options = { minify: false }) {
    const readyCache = this.#readyCache;
    const cacheKey = JSON.stringify(options);
    if (!readyCache.has(cacheKey)) readyCache.set(cacheKey, this.prepare(options));
    return readyCache.get(cacheKey);
  }

  readFilePath(fpath) {
    return Promise.all([
      readFile(fpath),
      lstat(fpath).then(stats => ({ 'Last-Modified': stats.mtime.toJSON() }))
    ]);
  }

  async readBuiltinJs(name) {
    const fpath = path.join(__dirname, '..', name);
    const result = await this.readFilePath(fpath);

    if (name == 'loader.js') {
      result[0] = await this.packet.parseLoader(this.packet.loaderConfig);
    }

    return result;
  }

  async _pack({ minify = false } = {}) {
    const { packet, entries, preload } = this;
    const files = preload.concat(entries);

    for (const file of files) {
      const mod = packet.files[file];
      // module might not ready yet
      if (mod.status < MODULE_LOADED) await waitFor(mod);
    }

    for (const dep of packet.all) {
      if (dep !== packet) await dep.pack({ minify });
    }
  }

  async reload() {
    for (const entry of Object.values(this.packet.entries)) {
      const bundle = this.packet.bundles[entry.file];
      if (!bundle) continue;
      const done = new WeakSet();
      outer: for (const mod of entry.family) {
        if (mod.packet === this.packet || done.has(mod.packet)) continue;
        done.add(mod.packet);
        for (const depBundle of Object.values(mod.packet.bundles)) {
          if (bundle.format === depBundle.format && depBundle.revalidate()) {
            bundle.reload();
            break outer;;
          }
        }
      }
    }
    await this._pack();
  }

  async pack({ minify = false } = {}) {
    await this._pack();
    const { packet, entries, preload } = this;
    const files = preload.concat(entries);

    for (const file of files) {
      const [ bundle ] = Bundle.wrap({ packet, entries: [ file ] });
      await (minify ? bundle.minify() : bundle.obtain());
    }
  }

  prepareFiles(files, isEntry = false) {
    const { packet } = this;
    return files.map(async function prepareFile(file, i) {
      const mod = isEntry ? await packet.parseEntry(file) : await packet.parseFile(file);
      // normalize file name
      if (mod) files[i] = mod.file;
    });
  }

  get lazyloads() {
    return this.lazyload.reduce((result, file) => {
      for (const mod of this.packet.files[file].family) result.add(mod);
      return result;
    }, new Set());
  }

  async prepare({ minify = false } = {}) {
    const { packet } = this;
    const { entries, lazyload, preload, cache } = this;

    // enable envify for root packet by default
    if (!packet.browserify) packet.browserify = { transform: ['envify'] };

    await packet.prepare();
    await cache.prepare({ packet });

    debug('parse preload, entries, and lazyload');
    await Promise.all([
      ...this.prepareFiles(preload),
      ...this.prepareFiles(entries, true),
      ...this.prepareFiles(lazyload),
    ]);

    for (const file of preload) {
      const entry = await packet.files[file];
      entry.isPreload = true;
      for (const mod of entry.family) mod.preloaded = !mod.packet.isolated;
    }

    for (const mod of this.lazyloads) {
      if (mod.packet === packet) {
        const bundle = Bundle.create({ packet, entries: [ mod.file ], package: false });
        packet.bundles[mod.file] = bundle;
        await (minify ? bundle.minify() : bundle.obtain());
      } else if (mod.packet) {
        mod.packet.lazyloaded = true;
      }
    }

    // compileAll(entries) needs to defer packing, otherwise pack when ready
    if (!minify) await this.pack({ minify });
  }

  async compilePackets(opts) {
    for (const packet of this.packet.all) {
      if (packet.parent) {
        await packet.compileAll(opts);
      }
    }
  }

  async compileExclusivePackets(opts) {
    const { bundle, packet } = this;
    const exclusives = new Set(bundle.exclude);

    // dependencies that have bundles as well (worker, wasm, etc.)
    for (const dep of packet.all) {
      if (dep !== packet && Object.keys(dep.bundles).length > 0) exclusives.add(dep.name);
    }

    for (const name of exclusives) {
      const packets = packet.findAll({ name });
      for (const dep of packets) await dep.compileAll(opts);
    }
  }

  async compileAll({ entries = [] }) {
    await this.ready({ minify: true });

    debug('parse additional entries');
    entries = entries.filter(file => !this.packet.entries[file]);
    if (entries.length > 0) {
      await Promise.all(entries.map(entry => this.packet.parseEntry(entry)));
    }
    entries = Object.keys(this.packet.entries);

    debug('packing necessary bundles');
    await this._pack({ minify: true });

    debug('compile packets');
    if (this.preload.length > 0) {
      await this.compileExclusivePackets({ all: true });
    } else {
      await this.compilePackets();
    }

    debug('compile preload');
    const manifest = {};
    for (const file of this.preload) {
      await this.packet.compile(file, { all: this.preload.length > 0, manifest });
    }

    debug('compile lazyload');
    for (const mod of this.lazyloads) {
      if (mod.packet === this.packet) {
        await mod.packet.compile(mod.file, { package: false, manifest });
      }
    }

    debug('compile entries');
    for (const entry of entries) {
      await this.packet.compile(entry, { all: this.preload.length > 0, manifest });
    }

    debug('manifest.json');
    await fs.writeFile(path.join(this.root, 'manifest.json'), JSON.stringify(manifest, null, 2));

    debug('done');
  }

  async compileEntry(entry, opts) {
    await this.ready({ minify: true });
    return this.packet.compile(entry, opts);
  }

  async isRawFile(file) {
    if (!this.source.serve) return false;

    if (file.startsWith('node_modules')) {
      // cnpm/npminstall rename packages to folders like _@babel_core@7.16.10@@babel/core
      const [, name] = file.replace(/^node_modules\//, '').replace(/^_@?[^@]+@[^@]+@/, '').match(rModuleId);
      // #1 cannot require('mocha') just yet
      return this.packet.find({ name }) || name == 'mocha';
    }

    // FIXME: packages/demo-component has package paths set to `.` which makes source serving error prone because the pathnames of source and the output are the same.
    if (this.packet.paths.includes(this.root)) return false;

    const fpath = path.join(this.root, file);
    for (const dir of this.packet.paths) {
      if (fpath.startsWith(dir) && existsSync(fpath)) return true;
    }

    return false;
  }

  async readRawFile(file) {
    const fpath = path.join(this.root, file);

    if (existsSync(fpath)) {
      return this.readFilePath(fpath);
    }
  }

  async parseId(id) {
    const { parseCache } = this;
    return parseCache[id] || (parseCache[id] = this._parseId(id));
  }

  async _parseId(id) {
    let [, name, version, file] = id.match(rModuleId);

    if (!version) {
      const { packet } = this;
      name = packet.name;
      version = packet.version;
      file = id;
    }

    const packet = this.packet.find({ name, version });
    if (!packet) throw new Error(`unknown dependency ${id}`);

    const ext = path.extname(file);
    // lazyloads should not go through `packet.parseEntry(file)`
    let mod = packet.files[file];
    let bundle = packet.bundles[mod ? mod.file : file];

    // - bundle is accessed for the first time and the entry is not prepared in advance
    // - bundle is a css bundle generated from js entry
    if (packet === this.packet && (!bundle || !mod)) {
      debug('parseEntry', file);
      mod = await packet.parseEntry(file.replace(rExt, '')).catch(() => null);
      if (ext === '.css') mod = await packet.parseEntry(file).catch(() => mod);
      await this.reload();
      [ bundle ] = mod ? Bundle.wrap({ packet, entries: [ mod.file ], format: ext }) : [];
    }

    this.parseCache[id] = null;
    return bundle;
  }

  async readCss(outputPath, query) {
    const isEntry = true;
    const id = outputPath.replace(/\.[a-f0-9]{8}\.css$/, '.css');

    const bundle = await this.parseId(id, { isEntry });
    if (!bundle) return;

    const result = await bundle.obtain();
    const code = `${result.code}\n/*# sourceMappingURL=${path.basename(bundle.output)}.map */`;
    return [ code, { 'Last-Modified': bundle.updatedAt.toGMTString() }];
  }

  async readJs(outputPath, query) {
    const isMain = outputPath.endsWith('.js') && 'main' in query;
    const isEntry = isMain || 'entry' in query;
    const id = outputPath.replace(/\.[a-f0-9]{8}\.js$/, '.js');

    const bundle = await this.parseId(id, { isEntry });
    if (!bundle) return;

    const result = await bundle.obtain({ loader: isMain  });
    const code = `${result.code}\n//# sourceMappingURL=${path.basename(bundle.output)}.map`;
    return [ code, { 'Last-Modified': bundle.updatedAt.toGMTString() } ];
  }

  async readMap(mapPath) {
    const id = mapPath.replace(/(?:\.[a-f0-9]{8})?(\.(?:css|js)).map$/, '$1');
    const bundle = await this.parseId(id);
    if (!bundle) return;

    let { map } = await bundle.obtain();
    if (map instanceof SourceMapGenerator) {
      map = map.toJSON();
    }
    map.sources = map.sources.map(source => source.replace(/^\//, ''));

    return [ map, { 'Last-Modified': bundle.updatedAt.toGMTString() } ];
  }

  async readWasm(outputPath) {
    const id = outputPath.replace(/\.[a-f0-9]{8}\.wasm$/, '.wasm');
    let [, name, version, file] = id.match(rModuleId);
    let packet;

    if (!version) {
      packet = this.packet;
      name = packet.name;
      version = packet.version;
      file = id;
    } else {
      packet = this.packet.find({ name, version });
    }

    const mod = await packet.parseFile(file);
    const { code } = await mod.obtain();
    const mtime = (await lstat(mod.fpath)).mtime.toJSON();
    return [code, { 'Last-Modified': mtime }];
  }

  async readFile(file, query) {
    await this.ready({ minify: process.env.NODE_ENV === 'production' });

    const { packet } = this;
    const ext = path.extname(file);
    let result = null;

    if (file === 'loader.js') {
      result = await this.readBuiltinJs(file);
    }
    else if (file === 'loaderConfig.json') {
      const { loaderConfig, lock } = packet;
      result = [
        JSON.stringify({ ...loaderConfig, lock }),
        { 'Last-Modified': (new Date()).toGMTString() }
      ];
    }
    else if (await this.isRawFile(file)) {
      result = await this.readRawFile(file);
    }
    else if (ext === '.js') {
      result = await this.readJs(file, query);
    }
    else if (ext === '.css') {
      result = await this.readCss(file, query);
    }
    else if (ext === '.map') {
      result = await this.readMap(file);
    }
    else if (ext === '.wasm') {
      result = await this.readWasm(file);
    }
    else if (rExt.test(ext)) {
      const [fpath] = await packet.resolve(file);
      if (fpath) {
        result = await this.readFilePath(fpath);
      }
    }

    if (result) {
      const body = result[0];
      const content = typeof body === 'string' ? body : JSON.stringify(body);
      result[1] = {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.lookup(ext),
        ETag: crypto.createHash('md5').update(content).digest('hex'),
        ...result[1]
      };
    }

    return result;
  }

  async destroy() {
    await this.packet.destroy();
  }

  func() {
    const Porter_readFile = this.readFile.bind(this);

    return function Porter_func(req, res, next) {
      if (res.headerSent) return next();

      function response(result) {
        if (result) {
          res.statusCode = 200;
          res.set(result[1]);
          if (req.fresh) {
            res.statusCode = 304;
          } else {
            res.write(result[0]);
          }
          res.end();
        } else {
          next();
        }
      }
      Porter_readFile(req.path.slice(1), req.query).then(response).catch(next);
    };
  }

  gen() {
    const Porter_readFile = this.readFile.bind(this);

    return function* Porter_generator(next) {
      const ctx = this;
      if (ctx.headerSent) return yield next;

      const id = ctx.path.slice(1);
      const result = yield Porter_readFile(id, ctx.query);

      if (result) {
        ctx.status = 200;
        ctx.set(result[1]);
        if (ctx.fresh) {
          ctx.status = 304;
        } else {
          ctx.body = result[0];
        }
      } else {
        yield next;
      }
    };
  }

  async() {
    const Porter_readFile = this.readFile.bind(this);

    return async function Porter_async(ctx, next) {
      if (ctx.headerSent) return await next();

      const id = ctx.path.slice(1);
      const result = await Porter_readFile(id, ctx.query);

      if (result) {
        ctx.status = 200;
        ctx.set(result[1]);
        if (ctx.fresh) {
          ctx.status = 304;
        } else {
          ctx.body = result[0];
        }
      } else {
        await next();
      }
    };
  }
}

module.exports = Porter;
