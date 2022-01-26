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

class Porter {
  #ready = null;

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
  }

  get ready() {
    return this.#ready || (this.#ready = this.prepare());
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

  async pack() {
    const { packet, entries, preload } = this;
    const files = preload.concat(entries);

    for (const file of files) {
      const mod = packet.files[file];
      // module might not ready yet
      if (mod.status < MODULE_LOADED) await waitFor(mod);
    }

    for (const dep of packet.all) {
      if (dep !== packet) await dep.pack();
    }

    for (const file of files) {
      const bundles = Bundle.wrap({ packet, entries: [ file ] });
      await Promise.all(bundles.map(bundle => bundle.obtain()));
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

  async prepare() {
    const { packet } = this;
    const { entries, lazyload, preload, cache } = this;

    // enable envify for root packet by default
    if (!packet.browserify) packet.browserify = { transform: ['envify'] };

    await packet.prepare();
    await cache.prepare({ packet });

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

    for (const file of lazyload) {
      const bundle = Bundle.create({ packet, entries: [ file ], package: false });
      packet.bundles[file] = bundle;
      await bundle.obtain();

      const mod = packet.files[file];
      for (const child of mod.children) {
        if (child.packet !== packet) child.packet.lazyloaded = true;
      }
    }

    await this.pack();
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

    // lazyloaded packets still need to be compiled because preload might not take place
    for (const name in packet.dependencies) {
      if (packet.dependencies[name].lazyloaded) exclusives.add(name);
    }

    for (const name of exclusives) {
      const packets = packet.findAll({ name });
      for (const dep of packets) await dep.compileAll(opts);
    }
  }

  async compileAll({ entries, sourceRoot }) {
    debug('init');
    await this.ready;

    debug('parse');
    if (entries) {
      await Promise.all(entries.map(entry => this.packet.parseEntry(entry)));
    } else {
      entries = Object.keys(this.packet.entries);
    }

    debug('minify');
    await Promise.all(Array.from(this.packet.all).reduce((tasks, packet) => {
      tasks.push(...Object.values(packet.files).map(mod => mod.minify()));
      return tasks;
    }, []));

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
    for (const file of this.lazyload) {
      for (const mod of this.packet.files[file].family) {
        if (mod.packet.parent) continue;
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
    await this.ready;
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
    let mod;
    // in case root entry is not parsed yet
    if (packet === this.packet) {
      debug('parseEntry', file);
      mod = await packet.parseEntry(file.replace(rExt, '')).catch(() => null);
      if (ext === '.css') mod = await packet.parseEntry(file).catch(() => null);
      await this.pack();
    }

    // prefer the real file extension
    return packet.bundles[mod ? mod.file : file];
  }

  async readCss(outputPath, query) {
    const isEntry = true;
    const id = outputPath.replace(/\.[a-f0-9]{8}\.css$/, '.css');

    const bundle = await this.parseId(id, { isEntry });
    if (!bundle) return;

    const result = await bundle.obtain();
    const code = `${result.code}\n/*# sourceMappingURL=${path.basename(bundle.output)}.map */`;
    return [ code, { 'Last-Modified': bundle.updatedAt }];
  }

  async readJs(outputPath, query) {
    const isMain = outputPath.endsWith('.js') && 'main' in query;
    const isEntry = isMain || 'entry' in query;
    const id = outputPath.replace(/\.[a-f0-9]{8}\.js$/, '.js');

    const bundle = await this.parseId(id, { isEntry });
    if (!bundle) return;

    const result = await bundle.obtain({ loader: isMain  });
    const code = `${result.code}\n//# sourceMappingURL=${path.basename(bundle.output)}.map`;
    return [ code, { 'Last-Modified': bundle.updatedAt } ];
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

    return [ map, { 'Last-Modified': bundle.updatedAt } ];
  }

  async readWasm(id) {
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
    await this.ready;

    const { packet } = this;
    const ext = path.extname(file);
    let result = null;

    if (file === 'loader.js') {
      result = await this.readBuiltinJs(file);
    }
    else if (file === 'loaderConfig.json') {
      const { loaderConfig, lock } = packet;
      for (const name in packet.dependencies) {
        const dep = packet.dependencies[name];
        if (dep.lazyloaded) lock[dep.name][dep.version] = dep.copy;
      }
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
