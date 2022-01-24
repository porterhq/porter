'use strict';

const path = require('path');
const fs = require('fs/promises');
const debug = require('debug')('porter');
const crypto = require('crypto');
const { version } = require('../package.json');

/**
 * Cache transpilation results of module
 */
module.exports = class Cache {
  constructor({ path: cachePath, identifier }) {
    this.path = cachePath;
    if (typeof identifier === 'function') this.identifier = identifier;
  }

  identifier({ packet }) {
    const rPorterDir = new RegExp(path.resolve(__dirname, '..'), 'g');
    const result = JSON.stringify({
      version,
      transpiler: {
        name: packet.transpiler,
        version: packet.transpilerVersion,
        options: packet.transpilerOpts,
      },
    });
    return result.replace(rPorterDir, '<porterDir>');
  }

  digest(source) {
    return crypto.createHash('md5').update(this.salt).update(source).digest('hex');
  }

  async get(key, source) {
    const cachePath = path.join(this.path, `${key}.cache`);
    const cacheContent = await fs.readFile(cachePath, 'utf8').catch(() => '');
    if (!cacheContent) return;

    const relativePath = path.relative(this.path, cachePath);
    let data = {};
    try {
      data = JSON.parse(cacheContent);
    } catch (err) {
      console.warn(new Error(`cache broken ${relativePath}`));
    }

    if (data.digest === this.digest(source)) return data;
  }

  async set(key, source, result) {
    const digest = this.digest(source);
    const fpath = path.join(this.path, key);
    await fs.mkdir(path.dirname(fpath), { recursive: true });
    await fs.writeFile(`${fpath}.cache`, JSON.stringify({ ...result, digest }));
  }

  async remove(key) {
    await fs.unlink(path.join(this.path, `${key}.cache`)).catch(() => {});
  }

  async prepare({ packet }) {
    this.salt = this.identifier({ packet });

    const saltPath = path.join(this.path, 'salt.cache');
    const salt = await fs.readFile(saltPath, 'utf8').catch(() => '');
    if (salt !== this.salt) {
      debug('cache salt changed from %j to %j', salt, this.salt);
      await fs.mkdir(path.dirname(saltPath), { recursive: true });
      await fs.writeFile(saltPath, this.salt);
    }
  }
};
