'use strict';

const Packet = require('./packet');

/**
 * FakePacket is used to anticipate a Porter project. With FakePacket we can
 * create Porter instances that maps existing Porter setup.
 */
module.exports = class FakePacket extends Packet {
  constructor(opts) {
    const { app, dir, paths, packet, lock } = opts;
    super({ app, dir, paths, packet });

    this._lock = lock;
    this._packet = packet;

    const { name, version } = packet;
    Object.assign(this, { name, version });
  }

  /**
   * The real packet lock should be used
   */
  get lock() {
    return this._lock;
  }

  /**
   * The real packet name and version should be used.
   */
  get loaderConfig() {
    return { ...super.loaderConfig, package: this._packet };
  }

  /**
   * To eliminate "unmet dependency" warnings.
   * @param {Object} opts
   */
  async parsePacket({ name, entry }) {
    const mod = await super.parsePacket({ name, entry });
    if (mod) return mod;

    const { _lock: lock } = this;
    const deps = lock[this.name][this.version].dependencies;

    if (name in deps) {
      const version = deps[name];
      return {
        name,
        version,
        file: entry || lock[name][version].main || 'index.js'
      };
    } else {
      return {
        name: this.name,
        version: this.version,
        file: entry
      };
    }
  }
};
