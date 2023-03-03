
import crypto from 'crypto';
import Debug from 'debug';
import fs from 'fs/promises';
import mime from 'mime';
import path from 'path';
import postcss, { AcceptedPlugin, Processor } from 'postcss';
import { SourceMapGenerator } from 'source-map';
import browserslist from 'browserslist';

import FakePacket from './fake_packet';
import Packet, { PacketMeta } from './packet';
import Module from './module';
import Bundle, { CompileOptions } from './bundle';
import { MODULE_LOADED, rModuleId } from './constants';
import AtImport from './at_import';
import Cache from './cache';
import { EXTENSION_MAP } from './constants';
import { MinifyOptions } from 'uglify-js';
import { ImportOption } from './named_import';

const { lstat, readFile } = fs;
const debug = Debug('porter');
const rExt = /\.(?:css|gif|jpg|jpeg|js|png|svg|swf|ico)$/i;

function waitFor(mod: Module) {
  return new Promise<void>((resolve, reject) => {
    const { app } = mod;

    (function poll() {
      if (mod.status >= MODULE_LOADED) return resolve();
      const blockers: string[] = [];
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

interface FallbackOptions {
  [key: string]: string | false;
}

type ReadResult = [Buffer | Record<string, any> | string, Record<string, any>] | null | undefined;

/**
 * - https://webpack.js.org/configuration/resolve/#resolvefallback
 */
const fallback: FallbackOptions = {
  fs: false,
  stream: 'readable-stream',
};

interface ParseOptions {
  loader: boolean;
}

interface PorterOptions {
  root?: string;
  paths?: string | string[];
  entries?: string[];
  preload?: string[];
  lazyload?: string[];
  cache?: {
    path: string;
    clean: boolean;
  };
  output?: {
    path?: string;
  };
  transpile?: {
    include?: string[];
    typescript?: 'tsc' | 'babel' | 'swc';
  };
  bundle?: {
    exclude?: string[];
  };
  resolve?: {
    import?: ImportOption[];
    alias?: Record<string, boolean | string>;
    fallback?: FallbackOptions;
    suffixes?: string[];
  };
  source?: {
    serve?: boolean;
    inline?: boolean;
    root?: string;
  };
  map?: Record<string, string>;
  lessOptions?: Record<string, any>;
  uglifyOptions?: MinifyOptions & { keep_fnames: RegExp };
  postcssPlugins?: AcceptedPlugin[];
  baseUrl?: string;
  lock?: Record<string, any>;
  package?: PacketMeta;
  /**
   * transform javascript and typescript with swc or not, disabled by default
   */
  swc?: boolean;
}

class Porter {
  #readyCache = new Map();
  moduleCache: Record<string, Module> = {};
  packetCache: Record<string, Packet> = {};
  parseCache: Record<string, Promise<Bundle | null> | null> = {};
  packet: Packet;
  root: string;
  baseUrl: string;
  map?: Record<string, string>;
  timeout: number;
  entries: string[];
  preload: string[];
  lazyload: string[];
  source: {
    serve: boolean;
    inline: boolean;
    root: string;
    mappingURL?: string;
  };
  cache: Cache;
  output: {
    clean: boolean;
    path: string;
  };
  bundle: {
    exclude: string[];
    exists?: (bundle: Bundle) => Promise<boolean>;
  };
  transpile: {
    include: string[];
    typescript: string;
  };
  resolve: {
    import?: ImportOption[];
    fallback: FallbackOptions;
    suffixes: string[];
  };
  cssTranspiler: Processor;
  lessOptions?: Record<string, any>;
  uglifyOptions?: Record<string, any>;
  browsers: string[];
  browserslistrc?: string;
  targets?: { [key: string]: number };
  lock?: Record<string, any>;
  swc: boolean = process.env.SWC === 'true';

  constructor(opts: PorterOptions) {
    const root = opts.root || process.cwd();
    const paths = ([] as string[]).concat(opts.paths == null ? 'components' : opts.paths).map(loadPath => {
      return path.resolve(root, loadPath);
    });
    const output = { path: 'public', clean: false, ...opts.output };
    output.path = path.resolve(root, output.path);

    const transpile = { include: [], typescript: 'tsc', ...opts.transpile };
    const cachePath = path.resolve(root, opts.cache && opts.cache.path || output.path);
    const cache = new Cache({ ...opts.cache, path: cachePath });

    const bundle = { exclude: [], ...opts.bundle };
    const resolve = {
      extensions: [ '*', '.js', '.jsx', '.ts', '.tsx', '.d.ts', '.json', '.css' ],
      alias: {},
      ...opts.resolve,
      import: opts.resolve?.import ? ([] as ImportOption[]).concat(opts.resolve.import) : [],
      fallback: { ...fallback, ...(opts.resolve && opts.resolve.fallback) },
    };
    const suffixes = resolve.extensions.reduce((result: string[], ext) => {
      if (ext === '*') return result.concat('');
      return result.concat(ext, `/index${ext}`);
    }, []);

    this.root = root;
    this.output = output;
    this.bundle = bundle;
    this.cache = cache;
    this.transpile = transpile;
    this.bundle = bundle;
    this.resolve = { ...resolve, suffixes };

    const packet = opts.package || require(path.join(root, 'package.json'));
    const packetOptions = { alias: resolve.alias, dir: root, paths, app: this, packet };

    // @ts-ignore
    this.packet = opts.package && opts.lock
      ? new FakePacket({ ...packetOptions, lock: opts.lock })
      : new Packet(packetOptions);

    this.baseUrl = opts.baseUrl || '/';
    this.map = opts.map;
    // Ignition timeout
    this.timeout = 30000;

    this.entries = ([] as string[]).concat(opts.entries || []);
    this.preload = ([] as string[]).concat(opts.preload || []);
    this.lazyload = ([] as string[]).concat(opts.lazyload || []);

    this.source = { serve: false, inline: false, root: 'http://localhost/', ...opts.source };
    this.cssTranspiler = postcss(([ AtImport ] as AcceptedPlugin[]).concat(opts.postcssPlugins || []));
    this.lessOptions = opts.lessOptions;
    this.uglifyOptions = opts.uglifyOptions;
    this.browsers = browserslist();
  }

  ready(options = { minify: false }) {
    const readyCache = this.#readyCache;
    const cacheKey = JSON.stringify(options);
    if (!readyCache.has(cacheKey)) readyCache.set(cacheKey, this.prepare(options));
    return readyCache.get(cacheKey);
  }

  async readFilePath(fpath: string | null): Promise<[string | Buffer, Record<string, any>] | undefined> {
    if (!fpath) return;
    try {
      return await Promise.all([
        readFile(fpath),
        lstat(fpath).then(stats => ({ 'Last-Modified': stats.mtime.toJSON() }))
      ]);
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return;
      throw err;
    }
  }

  async readBuiltinJs(name: string) {
    const fpath = path.join(__dirname, '..', name);
    const result = await this.readFilePath(fpath);

    if (name == 'loader.js') {
      const { code } = await this.packet.parseLoader(this.packet.loaderConfig);
      result![0] = code;
    }

    return result;
  }

  async pack({ minify = false } = {}) {
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

    for (const file of files) {
      Bundle.wrap({ packet, entries: [ file ] });
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
    await this.pack({ minify: false });
  }

  prepareFiles(files: string[], isEntry = false) {
    const { packet } = this;
    return files.map(async function prepareFile(file, i) {
      const mod = isEntry ? await packet.parseEntry(file) : await packet.parseFile(file);
      // normalize file name
      if (mod) files[i] = mod.file;
    });
  }

  get lazyloads() {
    return this.lazyload.reduce((result: Set<Module>, file: string) => {
      for (const mod of this.packet.files[file].family) result.add(mod);
      return result;
    }, new Set());
  }

  async prepare({ minify = false } = {}) {
    const { packet } = this;
    const { entries, lazyload, preload, cache } = this;

    // enable envify for root packet by default
    if (!packet.browserify) packet.browserify = { transform: ['envify'] };

    this.browserslistrc = await fs.readFile(path.join(this.root, '.browserslistrc'), 'utf8').catch(() => '');

    await cache.prepare(this);
    await packet.prepare();

    debug('parse preload, entries, and lazyload');
    await Promise.all([
      ...this.prepareFiles(preload),
      ...this.prepareFiles(entries, true),
      ...this.prepareFiles(lazyload),
    ]);

    for (const file of preload) {
      const entry = packet.files[file];
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
    if (!minify) {
      await this.pack({ minify });
      for (const bundle of Object.values(packet.bundles)) await bundle.obtain();
    }
  }

  async compilePackets(opts: CompileOptions) {
    for (const packet of this.packet.all) {
      if (packet.parent) {
        await packet.compileAll(opts);
      }
    }
  }

  async compileExclusivePackets(opts: CompileOptions) {
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

  async compileAll({ entries = [] }: { entries: string[] }) {
    if (this.output.clean) await fs.rm(this.output.path, { recursive: true, force: true });
    await this.ready({ minify: true });

    debug('parse additional entries');
    entries = entries.filter(file => !this.packet.entries[file]);
    if (entries.length > 0) {
      await Promise.all(entries.map(entry => this.packet.parseEntry(entry)));
    }
    entries = Object.keys(this.packet.entries);

    debug('packing necessary bundles');
    await this.pack({ minify: true });

    debug('compile packets');
    if (this.preload.length > 0) {
      await this.compileExclusivePackets({ all: true });
    } else {
      await this.compilePackets({});
    }

    const manifest = {};
    debug('compile lazyload');
    for (const mod of this.lazyloads) {
      if (mod.packet === this.packet) {
        await mod.packet.compile(mod.file, { package: false, manifest });
      }
    }

    debug('compile preload and entries');
    for (const bundle of Object.values(this.packet.bundles)) {
      await bundle.compile({ manifest });
    }

    debug('manifest.json');
    await fs.writeFile(path.join(this.root, 'manifest.json'), JSON.stringify(manifest, null, 2));

    debug('done');
  }

  async compileEntry(entry: string, opts: CompileOptions) {
    await this.ready({ minify: true });
    return this.packet.compile(entry, opts);
  }

  async readRawFile(file: string) {
    let fpath;

    if (file.startsWith('node_modules')) {
      // cnpm/npminstall rename packages to folders like _@babel_core@7.16.10@@babel/core
      const [, name, , entry] = file.replace(/^node_modules\//, '').replace(/^_@?[^@]+@[^@]+@/, '').match(rModuleId)!;
      const packet = this.packet.find({ name });
      fpath = packet && path.join(packet.dir, entry);
    } else {
      fpath = path.join(this.root, file);
      let found;
      for (const dir of this.packet.paths) {
        if (fpath.startsWith(dir)) found = true;
      }
      if (!found) fpath = null;
    }

    return await this.readFilePath(fpath);
  }

  async parseId(id: string, options?: ParseOptions) {
    const { parseCache } = this;
    return parseCache[id] || (parseCache[id] = this._parseId(id, options));
  }

  async _parseId(id: string, { loader = false } = {}): Promise<Bundle | null> {
    let [, name, version, file] = id.match(rModuleId)!;

    if (!version) {
      const { packet } = this;
      name = packet.name;
      version = packet.version;
      file = id;
    }

    const packet = this.packet.find({ name, version });
    if (!packet) throw new Error(`unknown dependency ${id}`);

    const format = path.extname(file);
    if (format !== '.js' && format !== '.css' && format !== '.wasm') {
      console.warn(new Error(`invalid id: ${id}`));
      return null;
    }
    const extensions = EXTENSION_MAP[format] || [];
    // lazyloads should not go through `packet.parseEntry(file)`
    let mod: Module | false | undefined = packet.files[file];
    let bundle: Bundle | null = null;
    for (const ext of extensions) {
      const key = (mod ? mod.file : file).replace(rExt, ext);
      if ((bundle = packet.bundles[key])) break;
    }

    // - bundle is accessed for the first time and the entry is not prepared in advance
    // - bundle is a css bundle generated from js entry
    if (packet === this.packet && (!bundle || !mod)) {
      debug('parseEntry', file);
      mod = await packet.parseEntry(file.replace(rExt, ''));
      if (format === '.css') mod = (await packet.parseEntry(file)) || mod;
      await this.reload();
      if (mod) {
        const bundles = Bundle.wrap({ packet, entries: [ mod.file ], format, loader });
        bundle = bundles[bundles.length - 1];
      }
    }

    this.parseCache[id] = null;
    return bundle;
  }

  async readCss(outputPath: string): Promise<ReadResult> {
    const id = outputPath.replace(/\.[a-f0-9]{8}\.css$/, '.css');

    const bundle = await this.parseId(id);
    if (!bundle) return;

    const result = await bundle.obtain();
    const code = `${result.code}\n/*# sourceMappingURL=${path.basename(bundle.output)}.map */`;
    return [ code, { 'Last-Modified': bundle.updatedAt!.toUTCString() }];
  }

  async readJs(outputPath: string, query: Record<string, any>): Promise<ReadResult> {
    const loader = outputPath.endsWith('.js') && 'main' in query;
    const id = outputPath.replace(/\.[a-f0-9]{8}\.js$/, '.js');

    const bundle = await this.parseId(id, { loader });
    if (!bundle) return;

    const result = await bundle.obtain();
    const code = `${result.code}\n//# sourceMappingURL=${path.basename(bundle.output)}.map`;
    return [ code, { 'Last-Modified': bundle.updatedAt!.toUTCString() } ];
  }

  async readMap(mapPath: string): Promise<ReadResult> {
    const id = mapPath.replace(/(?:\.[a-f0-9]{8})?(\.(?:css|js)).map$/, '$1');
    const bundle = await this.parseId(id);
    if (!bundle) return;

    let { map } = await bundle.obtain();
    if (map instanceof SourceMapGenerator) {
      map = map.toJSON();
    }
    if (map) return [ map, { 'Last-Modified': bundle.updatedAt!.toUTCString() } ];
  }

  async readWasm(outputPath: string): Promise<ReadResult> {
    const id = outputPath.replace(/\.[a-f0-9]{8}\.wasm$/, '.wasm');
    let [, name, version, file] = id.match(rModuleId)!;
    let packet;

    if (!version) {
      packet = this.packet;
      name = packet.name;
      version = packet.version;
      file = id;
    } else {
      packet = this.packet.find({ name, version });
    }

    if (!packet) return;
    const mod = await packet.parseFile(file);
    if (!mod) return;
    const { code } = await mod.obtain();
    const mtime = (await lstat(mod.fpath)).mtime.toJSON();
    return [code, { 'Last-Modified': mtime }];
  }

  async readFile(file: string, query: Record<string, any>) {
    file = decodeURIComponent(file);
    await this.ready({ minify: process.env.NODE_ENV === 'production' });

    const { packet } = this;
    const ext = path.extname(file);
    let result: ReadResult | null = null;

    if (file === 'loader.js') {
      result = await this.readBuiltinJs(file);
    }
    else if (file === 'loaderConfig.json') {
      const { loaderConfig, lock } = packet;
      result = [
        JSON.stringify({ ...loaderConfig, lock }),
        { 'Last-Modified': (new Date()).toUTCString() }
      ];
    }
    else if (ext === '.js') {
      result = await this.readJs(file, query);
    }
    else if (ext === '.css') {
      result = await this.readCss(file);
    }
    else if (ext === '.map') {
      result = await this.readMap(file);
    }
    else if (ext === '.wasm') {
      result = await this.readWasm(file);
    }
    else if (rExt.test(ext)) {
      const [fpath] = await packet.resolve(file);
      result = await this.readFilePath(fpath);
    }

    if (!result && this.source.serve) {
      result = await this.readRawFile(file);
    }

    if (result) {
      const body = result[0];
      const content = typeof body === 'string' ? body : JSON.stringify(body);
      result[1] = {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.getType(ext),
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

    return function Porter_func(req: any, res: any, next: () => {}) {
      if (res.headerSent) return next();

      function response(result?: ReadResult) {
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

    return function* Porter_generator(this: any, next: GeneratorFunction): any {
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

    return async function Porter_async(ctx: any, next: () => Promise<any>) {
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

export default Porter;
