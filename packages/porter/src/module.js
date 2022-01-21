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
    const lock = {};
    const packets = [];

    for (const mod of this.family) {
      const { packet } = mod;
      if (packets.includes(packet)) continue;
      packets.push(packet);
      const { name, version } = packet;
      const copies = lock[name] || (lock[name] = {});
      copies[version] = Object.assign(copies[version] || {}, packet.copy);
    }

    const { packet: rootPacket } = this;
    const { name, version } = rootPacket;
    const copy = lock[name][version];
    copy.dependencies = Object.keys(copy.dependencies).reduce((obj, prop) => {
      if (prop in lock) obj[prop] = copy.dependencies[prop];
      return obj;
    }, {});

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

  async parseDep(dep) {
    // require('https://example.com/foo.js')
    if (/^(?:https?:)?\/\//.test(dep)) return;

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

    const { packet } = this;
    if (dep == 'stream') packet.browser.stream = 'readable-stream';
    const specifier = packet.browser[dep] || packet.browser[`${dep}.js`] || dep;
    const mod = dep.startsWith('.')
      ? await this.parseRelative(specifier)
      : await this.parseNonRelative(specifier);

    // module is neglected in browser field
    if (mod === false) return mod;

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
  async checkDeps({ code }) {
    const deps = this.matchImport(code);

    if (!this.packet.parent && this.deps) {
      for (const dep of deps) {
        if (this.deps.includes(dep)) continue;
        await this.parseDep(dep);
      }
    }

    return deps;
  }

  /**
   * @returns {Object}
   */
  async obtain() {
    if (!this.cache) {
      const { code, map } = await this.load();
      this.deps = this.matchImport(code);
      this.setCache(code, await this.transpile({ code, map }));
    }
    return this.cache;
  }

  async reload() {
    debug(`reloading ${this.file} (${this.packet.dir})`);
    const { code, map } = await this.load();
    this.deps = await this.checkDeps({ code });
    this.setCache(code, await this.transpile({ code, map }));
  }

  async minify() {
    throw new Error('unimplemented method');
  }
};
