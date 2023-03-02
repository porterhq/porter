import Debug from 'debug';
import { existsSync, watch, FSWatcher, promises as fs } from 'fs';
// @ts-ignore
import looseEnvify from 'loose-envify';
import path from 'path';
import util from 'util';
import Glob from 'glob';
import Module, { ModuleOptions } from './module';
import CssModule from './css_module';
import LessModule from './less_module';
import JsModule from './js_module';
import JsonModule from './json_module';
import WasmModule from './wasm_module';
import SassModule from './sass_module';
import Stub from './stub';
import Bundle, { CompileOptions } from './bundle';
import { MODULE_LOADED } from './constants';
import Porter from './porter';
import { LoaderConfig, PartiallyRequired } from './defs';

const debug = Debug('porter');
const glob = util.promisify(Glob);

function createModule(opts: ModuleOptions) {
  const { fpath, packet } = opts;
  const { moduleCache } = packet.app;
  if (moduleCache[fpath]) return moduleCache[fpath];
  return (moduleCache[fpath] = _createModule(opts));
}

/**
 * Leave the factory method of Module here to keep from cyclic dependencies.
 * @param {Object} opts
 * @returns {Module}
 */
function _createModule(opts: ModuleOptions): Module {
  switch (path.extname(opts.file)) {
    case '.css':
      return new CssModule(opts);
    case '.json':
      return new JsonModule(opts);
    case '.wasm':
      return new WasmModule(opts);
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return new JsModule(opts);
    case '.less':
      return new LessModule(opts);
    case '.sass':
    case '.scss':
      return new SassModule(opts);
    default:
      return new Stub(opts);
  }
};

export interface PacketMeta {
  name: string;
  version: string;
  main: string;
  module: string;
  browserify: Record<string, any>;
  browser: string | Record<string, string | boolean>;
  babel: Record<string, any>;
  exports: Record<string, string | string[] | Record<string, string | Record<string, string>>>;
}

interface PacketOptions {
  app: Porter;
  dir: string;
  name?: string;
  paths?: string[];
  parent?: Packet;
  packet?: PacketMeta;
  alias?: Record<string, string | boolean>;
}

type PacketConstructor = PartiallyRequired<PacketOptions, 'packet'>;

interface FakeEntryOptions {
  entry: string;
  deps?: string[];
  imports?: string[];
  code: string;
}

export default class Packet {
  app: Porter;
  dir: string;
  name: string;
  version: string;
  paths: string[];
  parent?: Packet;
  dependencies: Record<string, Packet>;
  entries: Record<string, Module>;
  bundles: Record<string, Bundle>;
  files: Record<string, Module>;
  folder: Record<string, true>;
  browser: Record< string, string | false>;
  exports: Record<string, string | string[] | Record<string, string | Record<string, string>>>;
  browserify: Record<string, any>;
  depPaths: string[];
  isolated: boolean;
  alias: Record<string, string | boolean>;
  transpiler: string = '';
  transpilerVersion: string = '';
  transpilerOpts: Record<string, any> = {};
  lessPlugin?: { install: (less: any, pluginManager: any) => {}, minVersion: number[] };
  main: string = 'index.js';
  watchers?: FSWatcher[];
  lazyloaded?: boolean;
  fake: boolean = false;

  static create(options: PacketConstructor) {
    const { app, dir } = options;
    // packetCache is necessary because there might be multiple asynchronous parsing tasks on the same packet, such as `a => b` and `a => c => b`, which might return multiple packet instance of `b` since neither one can find the other during the `packet.create()` call.
    const { packetCache } = app;
    if (packetCache[dir]) return packetCache[dir];
    return (packetCache[dir] = new Packet(options));
  }

  static async findOrCreate({ name, dir, parent, app }: PacketOptions) {
    // cnpm (npminstall) dedupes dependencies with symbolic links
    dir = await fs.realpath(dir);
    const content = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
    const data = JSON.parse(content);

    // prefer existing packet to de-duplicate packets
    if (app.packet) {
      const { version } = data;
      const packet = app.packet.find({ name, version });
      if (packet) return packet;
    }

    const packet = Packet.create({ dir, parent, app, packet: { ...data, name } });
    await packet.prepare();
    return packet;
  }

  constructor({ app, dir, paths, parent, packet, alias }: PacketConstructor) {
    this.app = app;
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
    this.exports = packet.exports;
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

  get rootPacket() {
    let packet: Packet = this;
    while (packet.parent) packet = packet.parent;
    return packet;
  }

  get bundle() {
    const { bundles, main } = this;
    return bundles[main] || null;
  }

  /**
   * check if packet should be bundled and were not bundled yet
   */
  get bundleable(): boolean {
    const { app, bundles, isolated } = this;
    return (app.preload.length === 0 || isolated) && Object.keys(bundles).length === 0;
  }

  get all(): Iterable<Packet> {
    const packet = this;
    const iterable = {
      done: new WeakMap(),
      [Symbol.iterator]: function * () {
        if (!iterable.done.has(packet)) yield packet;
        iterable.done.set(packet, true);
        for (const dep of Object.values(packet.dependencies)) {
          if (iterable.done.has(dep)) continue;
          yield* Object.assign(dep.all, { done: iterable.done });
        }
      },
    };
    return iterable;
  }

  /**
   * Find packet by name or by name and version in the packet tree.
   * @param {Object} opts
   * @param {string} opts.name
   * @param {string} opts.version
   */
  find({ name, version }: { name?: string, version?: string }): Packet | null {
    if (!name) return this;

    for (const packet of this.all) {
      if (name == packet.name) {
        if (!version || packet.version == version) return packet;
      }
    }

    return null;
  }

  findAll({ name }: { name: string }) {
    const result: Packet[] = [];

    if (!name) return result;
    for (const packet of this.all) {
      if (name == packet.name) result.push(packet);
    }

    return result;
  }

  async parseDepPaths() {
    const { app, depPaths } = this;
    let packet: Packet | undefined = this;
    let parentDir;

    while (packet) {
      const depPath = path.join(packet.dir, 'node_modules');
      if (existsSync(depPath) && !depPaths.includes(depPath)) {
        depPaths.push(depPath);
      }
      parentDir = path.join(packet.dir, '..');
      packet = packet.parent;
    }

    let count = 0;
    // add global node_modules at root workspace
    while (app.packet.name.startsWith('@cara/') && parentDir && ++count <= 2) {
      const depPath = path.join(parentDir, 'node_modules');
      if (existsSync(depPath) && !depPaths.includes(depPath)) {
        depPaths.push(depPath);
      }
      parentDir = path.join(parentDir, '..');
    }
  }

  async findTranspiler() {
    if (this.transpiler) return;
    const obj = {
      babel: ['babel.config.js', 'babel.config.cjs', '.babelrc'],
      swc: '.swcrc',
    };
    const configMappers: { transpiler: string, config: any }[] = [];
    for (const key of Object.keys(obj) as Array<keyof typeof obj>) {
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
        if (['.js', '.cjs'].includes(path.extname(configObj.config))) {
          const exports = require(configPath);
          this.transpiler = configObj.transpiler;
          // cache 用于兼容 babel.config.js 中 api.cache 调用
          this.transpilerOpts = typeof exports === 'function' ? exports({ cache: () => {} }) : exports;
        } else {
          const content = await fs.readFile(configPath, 'utf8').catch(() => '');
          if (!content) continue;
          try {
            this.transpiler = configObj.transpiler;
            this.transpilerOpts = JSON.parse(content);
          } catch (err) {
            if (err instanceof Error) throw new Error(`${err.message} (${configPath})`);
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

    const normalizedFile = this.normalizeFile(main);
    if (!normalizedFile) return;

    const [ fpath ] = await this.resolve(normalizedFile);
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

  async onChange(eventType: string, filename: string) {
    if (filename && filename in this.files) await this.reload(eventType, filename);
  }

  async reload(eventType: string, filename: string) {
    const { files, app } = this;
    const mod = files[filename];
    const { mtime } = await fs.stat(mod.fpath).catch(() => ({ mtime: null }));
    if (mtime === null || mod.reloaded && mod.reloaded >= mtime) return;
    mod.reloaded = mtime;
    await mod.reload();

    const bundles = Object.values(this.bundles);
    if (app.packet !== this) bundles.push(...Object.values(app.packet.bundles));
    const outkeys = new Set();
    for (const bundle of bundles) {
      for (const m of bundle) {
        if (m === mod) {
          outkeys.add(bundle.outkey);
          if (bundle.format === '.js') outkeys.add(bundle.outkey.replace(/\.\w+$/, '.css'));
        }
      }
    }
    for (const bundle of bundles) {
      for (const outkey of outkeys) {
        if (bundle.outkey === outkey ) await bundle.reload();
      }
    }
  }

  tryRequire(name: string) {
    for (const depPath of this.depPaths) {
      try {
        return require(path.join(depPath, name));
      } catch (err) {
        // ignored
      }
    }
    console.error(new Error(`Cannot find dependency ${name} (${this.dir})`));
  }

  normalizeFile(file: string) {
    const { browser, exports } = this;

    // "browser" mapping in package.json
    let result = browser[`./${file}`];
    if (result === undefined) result = browser[`./${file}.js`];
    if (result === false) return result;
    if (typeof result === 'string') file = result;

    // "exports" mapping in package.json
    // - https://webpack.js.org/guides/package-exports/
    let map = exports && exports[`./${file}`];
    if (map) {
      result = '';
      if (typeof map === 'string') {
        result = map;
      } else if (Array.isArray(map)) {
        let found = map.find(item => typeof item === 'string');
        if (found) result = found;
      } else if ('require' in map) {
        result = typeof map.require === 'string' ? map.require : map.require.default;
      } else if ('import' in map) {
        result = typeof map.import === 'string' ? map.import : map.import.default;
      }
      if (result && result !== `./${file}`) {
        browser[`./${file}`] = result;
        file = result;
      }
    }

    // explicit directory require
    if (file.endsWith('/')) file += 'index';

    return file.replace(/^[\.\/]+/, '');
  }

  async parseModule(file: string) {
    const { files, folder, name, alias } = this;

    // alias takes precedence over original specifier
    for (const key of Object.keys(alias)) {
      if (file.startsWith(key)) {
        file = alias[key] + file.slice(key.length);
        break;
      }
    }

    const originFile = file;
    const normalizedFile = this.normalizeFile(file);
    // if neglected in browser field
    if (normalizedFile === false) return false;

    file = normalizedFile;
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

      const mod = createModule({ file, fpath, packet: this });
      return mod;
    }
  }

  async parseEntry(entry: string) {
    // entry is '' when `require('foo/')`, should fallback to `this.main`
    if (!entry) entry = this.main;
    const { app, entries, files } = this;
    const mod = await this.parseModule(entry);

    // if neglected in alias
    if (!mod) return mod;

    entries[mod.file] = files[mod.file] = mod;
    if (this === app.packet) app.entries = Object.keys(entries);

    await mod.parse();
    return mod;
  }

  async parseFile(file: string) {
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
   */
  async parseFakeEntry(options: FakeEntryOptions) {
    const { entry, imports = options.deps, code } = options;
    const { entries, files, paths } = this;
    const { moduleCache } = this.app;
    const fpath = path.join(paths[0], entry);
    delete moduleCache[fpath];
    const mod = createModule({ file: entry, fpath, packet: this });

    Object.assign(mod, { imports, code, fake: true });
    entries[mod.file] = files[mod.file] = mod;
    await mod.parse();
    return mod;
  }

  async parsePacket({ name, entry }: { name: string, entry: string }) {
    if (this.dependencies[name]) {
      const packet = this.dependencies[name];
      return await packet.parseEntry(entry);
    }

    for (const depPath of this.depPaths) {
      const dir = path.join(depPath, name);

      if (existsSync(dir)) {
        const { app } = this;
        const packet = await Packet.findOrCreate({ name, dir, parent: this, app });
        this.dependencies[packet.name] = packet;
        return await packet.parseEntry(entry);
      }
    }
  }

  async resolve(file: string) {
    const { app, paths } = this;
    const { suffixes } = app.resolve;

    for (const dir of paths) {
      for (const suffix of suffixes) {
        const fpath = path.join(dir, `${file}${suffix}`);
        const stats = await fs.lstat(fpath).catch(() => null);
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
    const copy: Record<string, any> = {};
    const manifest: Record<string, any> = {};
    const { app, dependencies, main, bundles, parent, entries, isolated } = this;

    for (const file in bundles) {
      if (!parent && entries[file] && !entries[file].isPreload) continue;
      const bundle = bundles[file];
      // css bundles generated with css in js but not lazyloaded css bundles
      if (!parent && !bundle.parent && bundle.format === '.css' && bundle.scope !== 'module') {
        continue;
      }
      // import(specifier) -> module.lock
      // import Worker from 'worker-loader!worker.js'; -> packet.copy
      // import 'react' // isolated; -> packet.copy
      // import Foo from './foo.wasm'; -> packet.copy
      if (isolated || !bundle.parent || app.preload.includes(bundle.entry)) {
        manifest[file] = bundle.output;
      }
    }

    if (Object.keys(manifest).length > 0) copy.manifest = manifest;
    if (!/^(?:\.\/)?index(?:.js)?$/.test(main)) copy.main = main;

    for (const name of ['folder', 'browser']) {
      const obj = this[name as 'folder' | 'browser'];
      const sorted = Object.keys(obj).sort().reduce((result: Record<string, any>, key) => {
        result[key] = obj[key];
        return result;
      }, {});
      if (Object.keys(obj).length > 0)  {
        copy[name] = { ...copy[name], ...sorted };
      }
    }

    if (dependencies && Object.keys(dependencies).length > 0) {
      copy.dependencies = Object.keys(dependencies).sort().reduce((result: Record<string, any>, key) => {
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

  async parseLoader(loaderConfig: LoaderConfig): Promise<{ sourceContent: string, code: string }> {
    const fpath = path.join(__dirname, '..', 'loader.js');
    const sourceContent = await fs.readFile(fpath, 'utf8');
    const code = await new Promise<string>(resolve => {
      const stream = looseEnvify(fpath, {
        BROWSER: true,
        NODE_ENV: process.env.NODE_ENV || 'development',
        loaderConfig
      });
      let buf = '';
      stream.on('data', (chunk: string) => buf += chunk);
      stream.on('end', () => resolve(buf));
      stream.end(sourceContent);
    });
    return { sourceContent, code };
  }

  async pack({ minify = false } = {}) {
    const entries = [];
    const { app, isolated, lazyloaded, main, files, bundles } = this;

    // the modules might not be fully parsed yet, the process returns early when parsing multiple times.
    await new Promise<void>(resolve => {
      (function poll() {
        if (Object.values(files).every(mod => mod.status >= MODULE_LOADED)) {
          resolve();
        } else {
          setTimeout(poll, 10);
        }
      })();
    });

    for (const mod of Object.values(files)) {
      if (mod.isRootEntry) {
        entries.push(mod.file);
      } else if (mod.file.endsWith('.wasm')) {
        // .wasm needs to be bundled before other entries to generate correct manifest
        entries.unshift(mod.file);
      }
    }

    // if packet won't be bundled with root entries, compile as main bundle.
    if (app.preload.length === 0 || isolated || lazyloaded) entries.push(main);

    for (const entry of new Set(entries)) {
      Bundle.create({
        packet: this,
        entries: entry === main ? undefined : [ entry ],
      });
    }

    for (const bundle of Object.values(bundles)) {
      if (bundle.entries.length > 0 && !(minify && await bundle.exists())) {
        await (minify ? bundle.minify() : bundle.obtain());
      }
    }
  }

  async compileAll(opts: CompileOptions) {
    const { bundles } = this;
    for (const bundle of Object.values(bundles)) await bundle.compile(opts);
  }

  async compile(entries: string | string[], opts: CompileOptions) {
    if (!Array.isArray(entries)) entries = [entries];
    opts = { package: true, ...opts };
    const { manifest = {}, writeFile = true } = opts;

    // compile({ entry: 'fake/entry', deps, code }, opts)
    if (typeof entries[0] === 'object') {
      const [{ entry }] = entries;
      // clear bundle cache, fake entries should always start from scratch
      delete this.bundles[entry];
      delete this.files[entry];
      delete this.entries[entry];
      await this.parseFakeEntry(entries[0]);
      entries[0] = entry;
    }

    const bundles = Bundle.wrap({ ...opts, packet: this, entries });
    let result;
    for (const bundle of bundles) {
      result = await bundle.compile({ manifest, writeFile });
    }

    return writeFile ? bundles[0] : result;
  }

  async destroy() {
    if (Array.isArray(this.watchers)) {
      for (const watcher of this.watchers) watcher.close();
    }
  }
};
