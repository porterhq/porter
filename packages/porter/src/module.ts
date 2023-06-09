import Debug from 'debug';
import path from 'path';
import { RawSourceMap } from 'source-map';
import { MODULE_INIT, rModuleId } from './constants';
import Packet from './packet';
import Porter from './porter';

const debug = Debug('porter');

export interface ModuleOptions {
  file: string;
  fpath: string;
  packet: Packet;
  code?: string;
}

export interface ModuleCache {
  code: string;
  map: RawSourceMap;
  imports: string[];
  exports?: Record<string, any>;
  dynamicImports: string[];
  minified?: boolean;
  __esModule?: boolean;
}

export interface SourceOptions {
  code: string;
  map?: RawSourceMap;
}

export interface TranspileOptions {
  code: string;
  map?: RawSourceMap;
  minify?: boolean;
}

export default class Module {
  app: Porter;
  packet: Packet;
  name: string;
  version: string;
  file: string;
  fpath: string;
  parent?: Module;
  children: Module[];
  dynamicChildren: Module[] = [];
  imports?: string[];
  dynamicImports?: string[];
  __esModule?: boolean;
  entries: Module[];
  loaders: Record<string, any> = {};
  status: number;
  isPreload?: boolean;
  preloaded?: boolean;
  reloaded?: Date | null;
  fake?: boolean;
  isolated?: boolean;
  cache?: ModuleCache;
  code?: string;

  constructor({ file, fpath, packet }: ModuleOptions) {
    this.app = packet.app;
    this.packet = packet;
    this.name = packet.name;
    this.version = packet.version;

    this.file = file;
    this.fpath = fpath;
    this.children = [];
    this.entries = [];
    this.status = MODULE_INIT;
  }

  get id() {
    const file = this.file.replace(/\.[jt]sx?/, '.js');
    if (!this.packet.parent) return file;
    return [this.name, this.version, file].join('/');
  }

  get isRootEntry() {
    const { file, isWorker, packet } = this;
    return file in packet.entries && (!packet.parent || isWorker);
  }

  get isWorker() {
    const { loaders } = this;
    return loaders && loaders.hasOwnProperty('worker-loader');
  }

  get family(): Iterable<Module> {
    const mod = this;
    const iterable = {
      done: ({} as Record<string, boolean>),
      * [Symbol.iterator]() {
        const { done } = iterable;
        const { id, children } = mod;
        if (done[id]) return;
        done[id] = true;
        for (const child of children) {
          if (child instanceof Module) {
            yield* Object.assign(child.family, { done });
          }
        }
        yield mod;
      },
    };
    return iterable;
  }

  get immediateFamily(): Iterable<Module> {
    const mod = this;
    const iterable = {
      done: ({} as Record<string, boolean>),
      * [Symbol.iterator]() {
        const { done } = iterable;
        const { id, children, dynamicChildren = [] } = mod;
        if (done[id]) return;
        done[id] = true;
        for (const child of children) {
          if (child instanceof Module && !dynamicChildren.includes(child)) {
            yield* Object.assign(child.immediateFamily, { done });
          }
        }
        yield mod;
      },
    };
    return iterable;
  }

  get dynamicFamily(): Iterable<Module> {
    const mod = this;
    const iterable = {
      done: ({} as Record<string, boolean>),
      * [Symbol.iterator]() {
        const { done } = iterable;
        const { id, children, dynamicChildren = [] } = mod;
        if (done[id]) return;
        done[id] = true;
        for (const child of children) {
          if (dynamicChildren.includes(child) && !done[child.id]) {
            done[child.id] = true;
            yield child;
          } else if (child instanceof Module) {
            yield* Object.assign(child.dynamicFamily, { done });
          }
        }
      },
    };
    return iterable;
  }

  get lock() {
    if (this.packet.fake) return this.packet.lock;
    const lock: Record<string, any> = {};
    const entries: Module[] = [ this ];
    const { app, fake } = this;
    const packets: Set<Packet> = new Set();

    if (!fake && this.packet === app.packet) {
      for (const file of [ ...app.preload, ...app.lazyload ]) {
        entries.push(this.packet.files[file]);
      }
    }

    for (const entry of entries) {
      for (const mod of entry.family) {
        if (mod.packet === app.packet) {
          packets.add(mod.packet);
        } else {
          for (const packet of mod.packet.all) packets.add(packet);
        }
      }
    }

    const sortedPackets = [ ...packets ].sort(function(a, b) {
      if (a.name > b.name) return 1;
      if (a.name < b.name) return -1;
      if (a.version > b.version) return 1;
      if (a.version < b.version) return -1;
      return 0;
    });

    for (const packet of sortedPackets) {
      const { name, version, copy } = packet;
      const copies = lock[name] || (lock[name] = {});
      copies[version] = { ...copies[version], ...copy };
    }

    const { bundles, name, version } = this.packet;
    const bundle = bundles[this.file];
    const children = bundle && bundle.children || [];

    for (const mod of this.family) {
      if (mod !== this && mod.isRootEntry && !mod.isWorker) {
        const depBundle = bundles[mod.file];
        if (!children.includes(depBundle)) children.push(depBundle);
      }
    }

    if (children.length > 0) {
      for (const child of children) {
        const copy = lock[child.packet.name][child.packet.version];
        const { manifest = {} } = copy;
        copy.manifest = manifest;
        manifest[child.outkey.replace(/\.(?!json)\w+$/, child.format)] = child.output;
      }
    } else if (this.fake) {
      // fake modules are self contained
      const copy = lock[name][version];
      copy.manifest = undefined;
    }

    return lock;
  }

  setCache(source: string, result: { code: string, map?: string | RawSourceMap, minified?: boolean }) {
    const { app, imports = [], dynamicImports = [], __esModule } = this;
    const cache = {
      ...result,
      map: typeof result.map === 'string' ? JSON.parse(result.map) : result.map,
      imports,
      dynamicImports,
      __esModule,
    };
    app.cache.set(this.id, source, cache).catch(err => console.error(err));
    this.cache = cache;
  }

  async parseRelative(dep: string) {
    const { packet } = this;
    const file = path.join(path.dirname(this.file), dep);

    return await packet.parseFile(file);
  }

  async parseNonRelative(dep: string) {
    const { packet } = this;
    const [, name, , entry] = dep.match(rModuleId)!;
    let mod = await packet.parsePacket({ name, entry });

    // Allow root/a => packet/b => root/c
    if (mod == null) {
      const { rootPacket } = packet;
      const specifier = name == rootPacket.name ? (entry || rootPacket.main) : dep;
      mod = await rootPacket.parseFile(specifier);
    }

    return mod;
  }

  async parseImport(dep: string): Promise<Module | false | undefined> {
    // require('https://example.com/foo.js')
    // require('/path/to/remote.js')
    if (/^(?:https?:)?\//.test(dep)) return;

    const loaders: Record<string, any> = {};

    if (dep.includes('!')) {
      const segments = dep.split('!');
      dep = segments.pop()!;
      for (const segment of segments) {
        const [loader, opts] = segment.split('?');
        const searchParams = new URLSearchParams(opts);
        const result: Record<string, any> = {};
        for (const key of searchParams.keys()) result[key] = searchParams.get(key);
        loaders[loader] = result;
      }
    } else if (dep.includes('?')) {
      const [pathname, search] = dep.split('?');
      dep = pathname;
      const searchParams = new URLSearchParams(search);
      if (searchParams.has('worker')) {
        const result: Record<string, any> = {};
        for (const key of searchParams.keys()) result[key] = searchParams.get(key);
        loaders['worker-loader'] = result;
      }
    }

    const { packet, app } = this;
    const specifier = packet.browser[dep] || packet.browser[`${dep}.js`] || dep;
    const mod = dep.startsWith('.')
      ? await this.parseRelative(specifier)
      : await this.parseNonRelative(specifier);

    // module is neglected in browser field
    if (mod === false) return mod;

    if (mod == null && app.resolve.fallback.hasOwnProperty(specifier)) {
      const result = app.resolve.fallback[specifier];
      if (result != null) packet.browser[specifier] = result;
      // fallback: { fs: false }
      if (result === false) return result;
      // fallback: { path: 'path-browserify' }
      if (typeof result === 'string') return await this.parseImport(result);
    }

    if (!mod) {
      console.error(`unmet dependency ${dep} (${this.fpath})`);
      return;
    }

    mod.loaders = loaders;
    if (loaders['worker-loader']) {
      // modules required by worker-loader shall be treated as entries.
      mod.packet.entries[mod.file] = mod;
    } else {
      if (!mod.parent) mod.parent = this;
      if (!this.children.includes(mod)) this.children.push(mod);
    }

    return mod;
  }

  async parse() {
    throw new Error('unimplemented method');
  }

  matchImport(code: string) {
    throw new Error('unimplemented method');
  }

  async load(): Promise<{ code: string, map?: RawSourceMap }> {
    throw new Error('unimplemented method');
  }

  async transpile(options: TranspileOptions): Promise<{ code: string, map?: RawSourceMap }> {
    throw new Error('unimplemented method');
  }

  /**
   * Find deps of code and compare them with existing `this.deps` to see if there's
   * new dep to parse. Only the modules of the root packet are checked.
   */
  async checkImports({ code }: SourceOptions) {
    const { imports } = this;
    this.matchImport(code);
    if (this.imports && imports) {
      for (const dep of this.imports) {
        if (!imports.includes(dep)) await this.parseImport(dep);
      }
    }
  }

  async obtain() {
    if (!this.cache) {
      const { code, map } = await this.load();
      if (!this.imports) this.matchImport(code);
      this.setCache(code, await this.transpile({ code, map }));
    }
    return this.cache!;
  }

  async reload() {
    debug(`reloading ${this.file} (${this.packet.dir})`);
    const { code, map } = await this.load();
    await this.checkImports({ code });
    this.setCache(code, await this.transpile({ code, map }));
  }

  async minify(): Promise<{ code: string, map?: RawSourceMap}> {
    throw new Error('unimplemented method');
  }
};
