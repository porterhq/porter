'use strict'

const Package = require('./package')

/**
 * FakePackage is used to anticipate a Porter project. With FakePackage we can
 * create Porter instances that maps existing Porter setup.
 */
module.exports = class FakePackage extends Package {
  constructor(opts) {
    const { app, dir, paths, package: pkg, lock } = opts
    super({ app, dir, paths, package: pkg })

    this._lock = lock
    this._package = pkg

    const { name, version } = pkg
    Object.assign(this, { name, version })
  }

  /**
   * The real package lock should be used
   */
  get lock() {
    return this._lock
  }

  /**
   * The real package name and version should be used.
   */
  get loaderConfig() {
    return { ...super.loaderConfig, package: this._package }
  }

  /**
   * To eliminate "unmet dependency" warnings.
   * @param {Object} opts
   */
  async parsePackage({ name, entry }) {
    const mod = await super.parsePackage({ name, entry })
    if (mod) return mod

    const { _lock: lock } = this
    const deps = lock[this.name][this.version].dependencies

    if (name in deps) {
      const version = deps[name]
      return {
        name,
        version,
        file: entry || lock[name][version].main || 'index.js'
      }
    } else {
      return {
        name: this.name,
        version: this.version,
        file: entry
      }
    }
  }
}
