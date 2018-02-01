'use strict'

/**
 * @module
 */

const path = require('path')
const crypto = require('crypto')
const { exists, readdir, readFile, unlink, writeFile } =  require('mz/fs')
const mkdirp = require('./mkdirp')

const rExt = /(\.\w+)$/

/**
 * Cache
 */
class Cache {
  /**
   * @constructor
   * @param {Object} opts
   * @param {string} opts.dest     Where to store the cached files
   * @param {string} opts.encoding The encoding of the source files
   * @param {string} opts.root     The root path
   */
  constructor(opts) {
    const { dest, root } = opts

    if (!dest) {
      throw new Error('Please specify the cache destination folder.')
    }

    this.dest = dest
    this.root = root
  }

  async read(id, source) {
    const checksum = crypto.createHash('md5').update(source).digest('hex')
    const cacheName = id.replace(rExt, '-' + checksum + '$1')
    const fpath = path.join(this.dest, cacheName)

    if (await exists(fpath)) {
      return await readFile(fpath, 'utf8')
    }
  }

  async write(id, source, content) {
    const md5 = crypto.createHash('md5').update(source)
    const cacheId = id.replace(rExt, '-' + md5.digest('hex') + '$1')
    const fpath = path.join(this.dest, cacheId)

    await this.remove(id, cacheId)
    await mkdirp(path.dirname(fpath))
    await writeFile(fpath, content)
  }

  async writeFile(id, content) {
    const fpath = path.join(this.dest, id)

    await mkdirp(path.dirname(fpath))
    await writeFile(fpath, content)
  }

  async remove(id) {
    const fname = path.basename(id)
    const dir = path.join(this.dest, path.dirname(id))

    if (!(await exists(dir))) return

    const entries = await readdir(dir)

    for (let i = 0, len = entries.length; i < len; i++) {
      const entry = entries[i]
      if (entry.replace(/-[0-9a-f]{32}(\.(?:js|css))$/, '$1') === fname) {
        await unlink(path.join(dir, entry))
      }
    }
  }
}

module.exports = Cache
