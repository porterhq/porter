'use strict';

const crypto = require('crypto');
const debug = require('debug')('porter');
const { existsSync, promises: fs } = require('fs');
const mime = require('mime');
const path = require('path');
const postcss = require('postcss');
const { SourceMapGenerator } = require('source-map');

const { lstat, readFile, writeFile } = fs;

const FakePacket = require('./fake_packet');
const Packet = require('./packet');

const rExt = /\.(?:css|gif|jpg|jpeg|js|png|svg|swf|ico)$/i;
const { rModuleId } = require('./module');
const Bundle = require('./bundle');
const { MODULE_LOADED } = require('./constants');
const AtImport = require('./at_import');

class Porter {
  constructor(opts) {
    const root = opts.root || process.cwd();
    const paths = [].concat(opts.paths == null ? 'components' : opts.paths).map(loadPath => {
      return path.resolve(root, loadPath);
    });
    const dest = path.resolve(root, opts.dest || 'public');
    const transpile = { only: [], ...opts.transpile };
    const cache = { dest, ...opts.cache };
    const bundleExcept = opts.bundle && opts.bundle.except || [];

    Object.assign(this, { root, dest, cache, transpile, bundleExcept });
    const packet = opts.package || require(path.join(root, 'package.json'));

    cache.dest = path.resolve(root, cache.dest);

    this.moduleCache = {};
    this.packetCache = {};

    this.packet = opts.package
      ? new FakePacket({ dir: root, paths, app: this, packet: opts.package, lock: opts.lock })
      : new Packet({ dir: root, paths, app: this, packet });

    this.baseUrl = opts.baseUrl || '/';
    this.map = opts.map;
    // Ignition timeout
    this.timeout = 30000;

    this.entries = [].concat(opts.entries || []);
    this.preload = [].concat(opts.preload || []);
    this.lazyload = [].concat(opts.lazyload || []);

    this.source = { serve: false, root: '/', ...opts.source };
    this.cssTranspiler = postcss([ AtImport ].concat(opts.postcssPlugins || []));
    this.ready = this.prepare(opts);
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

    for (const dep of packet.all) {
      if (dep !== packet) await dep.pack();
    }

    for (const file of preload.concat(entries)) {
      const mod = packet.files[file];
      // module might not ready yet
      if (mod.status < MODULE_LOADED) continue;
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

  async prepare(opts = {}) {
    const { packet } = this;
    const { entries, lazyload, preload } = this;

    // enable envify for root packet by default
    if (!packet.browserify) packet.browserify = { transform: ['envify'] };

    await packet.prepare();

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
    }

    await this.pack();

    const { cache } = this;
    await fs.rm(path.join(cache.dest, '**/*.{css,js,map}'), { recursive: true, force: true });
  }

  async compilePackets(opts) {
    for (const packet of this.packet.all) {
      if (packet.parent) {
        await packet.compileAll(opts);
      }
    }
  }

  async compileExclusivePackets(opts) {
    const { bundleExcept, lazyload, packet } = this;
    const exclusives = new Set(bundleExcept);

    if (lazyload.length > 0) {
      for (const file of lazyload) {
        const mod = packet.files[file];
        for (const child of mod.children) {
          if (child.packet !== packet && !child.preloaded) {
            exclusives.add(child.packet.name);
          }
        }
      }
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
    return this.packet.compile(entry, opts);
  }

  async isRawFile(file) {
    if (!this.source.serve) return false;

    if (file.startsWith('node_modules')) {
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

  async parseId(id, { isEntry } = {}) {
    let [, name, version, file] = id.match(rModuleId);

    if (!version) {
      const { packet } = this;
      name = packet.name;
      version = packet.version;
      file = id;
    }

    const packet = this.packet.find({ name, version });
    if (!packet) throw new Error(`unknown dependency ${id}`);

    const mod = isEntry ? await packet.parseEntry(file) : await packet.parseFile(file);
    if (mod) return mod;

    const bundle = packet.bundles[file];
    // @babel/runtime has no main
    // css bundles might be extracted from corresponding js bundles
    if (bundle) return { file, fake: true, packet };
  }

  async writeSourceMap({ bundle, code, map }) {
    if (map instanceof SourceMapGenerator) {
      map = map.toJSON();
    }

    map.sources = map.sources.map(source => source.replace(/^\//, ''));
    const { output, format } = bundle;
    code += format === '.js'
      ? `\n//# sourceMappingURL=${path.basename(output)}.map`
      : `\n/*# sourceMappingURL=${path.basename(output)}.map */`;

    const fpath = path.join(this.cache.dest, bundle.outputPath);
    await fs.mkdir(path.dirname(fpath), { recursive: true });
    await Promise.all([
      writeFile(fpath, code),
      writeFile(`${fpath}.map`, JSON.stringify(map, (k, v) => {
        if (k !== 'sourcesContent') return v;
      }))
    ]);

    return { code };
  }

  async readCss(id, query) {
    id = id.replace(/\.[a-f0-9]{8}\.css$/, '.css');
    const isEntry = true;
    let mod = await this.parseId(id, { isEntry });
    // css bundle needs the corresponding js bundle be ready first
    if (mod) {
      if (isEntry && !mod.fake) await this.pack();
    } else {
      await this.parseId(id.replace(/\.css$/, '.js'), { isEntry });
      if (isEntry) await this.pack();
      mod = await this.parseId(id, { isEntry });
    }

    if (!mod) return;
    const { fake, packet } = mod;
    const mtime = fake ? new Date().toGMTString() : (await lstat(mod.fpath)).mtime.toJSON();
    const bundle = packet.bundles[mod.file];
    if (!bundle) throw new Error(`unknown bundle ${mod.file} in ${packet.name}`);
    const result = await bundle.obtain();
    const { code } = await this.writeSourceMap({ bundle, ...result });

    return [ code, { 'Last-Modified': mtime }];
  }

  async readJs(id, query) {
    const isMain = id.endsWith('.js') && 'main' in query;
    const isEntry = isMain || 'entry' in query;
    id = id.replace(/\.[a-f0-9]{8}\.js$/, '.js');
    const mod = await this.parseId(id, { isEntry });

    if (!mod) return;
    if (isEntry) await this.pack();

    const { fake, packet } = mod;
    const mtime = fake ? new Date().toGMTString() : (await lstat(mod.fpath)).mtime.toJSON();
    const bundle = packet.bundles[mod.file.replace(/\.\w+$/, '.js')];
    if (!bundle) throw new Error(`unknown bundle ${mod.file} in ${packet.name}`);
    const result = await bundle.obtain({ loader: isMain  });

    const { code } = await this.writeSourceMap({ bundle, ...result });
    return [code, { 'Last-Modified': mtime }];
  }

  async readMap(id) {
    const fpath = path.join(this.cache.dest, id);
    if (existsSync(fpath)) {
      return this.readFilePath(fpath);
    }
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
      result = [
        JSON.stringify(Object.assign(packet.loaderConfig, { lock: packet.lock })),
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
      result[1] = {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.lookup(ext),
        ETag: crypto.createHash('md5').update(result[0]).digest('hex'),
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
