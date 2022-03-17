'use strict';

const debug = require('debug')('porter');
const path = require('path');
const { MODULE_INIT, rModuleId } = require('./constants');

module.exports = class Module {
  constructor({ file, fpath, packet }) {
    const { moduleCache } = packet.app;
    if (moduleCache[fpath]) return moduleCache[fpath];
    moduleCache[fpath] = this;

    Object.defineProperties(this, {
      app: {
        value: packet.app,
        configurable: true,
        enumerable: false,
      },
    });
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
    const file = this.file.replace(/\.tsx?/, '.js');
    if (!this.packet.parent) return file;
    return [this.name, this.version, file].join('/');
  }

  get isRootEntry() {
    const { file, isWorker, packet } = this;
    return file in packet.entries && (!packet.parent || isWorker);
  }

  get isWorker() {
    const { loaders } = this;
    return loaders && loaders['worker-loader'];
  }

  get family() {
    const iterable = { done: {} };
    iterable[Symbol.iterator] = function* () {
      const { done } = iterable;
      if (!done[this.id]) {
        done[this.id] = true;
        for (const child of Object.values(this.children)) {
          if (child instanceof Module && !done[child.id]) {
            yield* Object.assign(child.family, { done });
          }
        }
      }
      yield this;
    }.bind(this);
    return iterable;
  }

  get lock() {
    if (this.packet.fake) return this.packet.lock;
    const lock = {};
    const entries = [ this ];
    const { app, fake } = this;
    const packets = new Set();

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

    return lock;
  }

  setCache(source, result) {
    const { app } = this;
    if (typeof result.map === 'string') result.map = JSON.parse(result.map);
    app.cache.set(this.id, source, result).catch(err => console.error(err.stack));
    this.cache = result;
  }

  async parseRelative(dep) {
    const { packet } = this;
    const file = path.join(path.dirname(this.file), dep);

    return await packet.parseFile(file);
  }

  async parseNonRelative(dep) {
    const { packet } = this;
    const [, name, , entry] = dep.match(rModuleId);
    let mod = await packet.parsePacket({ name, entry });

    // Allow root/a => packet/b => root/c
    if (mod == null) {
      const { rootPacket } = packet;
      const specifier = name == rootPacket.name ? (entry || rootPacket.main) : dep;
      mod = await rootPacket.parseFile(specifier);
    }

    return mod;
  }

  async parseImport(dep) {
    // require('https://example.com/foo.js')
    // require('/path/to/remote.js')
    if (/^(?:https?:)?\//.test(dep)) return;

    const loaders = {};

    if (dep.includes('!')) {
      const segments = dep.split('!');
      dep = segments.pop();
      for (const segment of segments) {
        const [loader, opts] = segment.split('?');
        const searchParams = new URLSearchParams(opts);
        const result = {};
        for (const key of searchParams.keys()) result[key] = searchParams.get(key);
        loaders[loader] = result;
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
      console.error(new Error(`unmet dependency ${dep} (${this.fpath})`).stack);
      return;
    }

    mod.loaders = loaders;
    if (loaders['worker-loader']) {
      // modules required by worker-loader shall be treated as entries.
      mod.packet.entries[mod.file] = mod;
    } else {
      if (!mod.parent) mod.parent = this;
      this.children.push(mod);
    }

    return mod;
  }

  async parse() {
    throw new Error('unimplemented method');
  }

  matchImport() {
    throw new Error('unimplemented method');
  }

  async load() {
    throw new Error('unimplemented method');
  }

  async transpile() {
    throw new Error('unimplemented method');
  }

  /**
   * Find deps of code and compare them with existing `this.deps` to see if there's
   * new dep to parse. Only the modules of the root packet are checked.
   * @param {Object} opts
   * @param {string} opts.code
   * @returns {Array}
   */
  async checkImports({ code }) {
    const { imports } = this;
    this.matchImport(code);
    if (this.imports) {
      for (const dep of this.imports) {
        if (!imports.includes(dep)) await this.parseImport(dep);
      }
    }
  }

  /**
   * @returns {Object}
   */
  async obtain() {
    if (!this.cache) {
      const { code, map } = await this.load();
      this.matchImport(code);
      this.setCache(code, await this.transpile({ code, map }));
    }
    return this.cache;
  }

  async reload() {
    debug(`reloading ${this.file} (${this.packet.dir})`);
    const { code, map } = await this.load();
    await this.checkImports({ code });
    this.setCache(code, await this.transpile({ code, map }));
  }

  async minify() {
    throw new Error('unimplemented method');
  }
};
