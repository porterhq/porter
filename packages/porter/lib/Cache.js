'use strict'

/**
 * @module
 */

const path = require('path')
const crypto = require('crypto')
const _spawn = require('child_process').spawn
const rimraf = require('rimraf')
const { exists, readdir, readFile, unlink, writeFile } =  require('mz/fs')
const mkdirp = require('./mkdirp')

function spawn(command, args, opts) {
  return new Promise(function(resolve, reject) {
    var proc = _spawn(command, args, opts)

    proc.on('exit', function(code) {
      if (code === 0) resolve()
      else reject(new Error(code))
    })
  })
}

function rmdir(dir, opts = {}) {
  return new Promise((resolve, reject) => {
    rimraf(dir, opts, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

const RE_EXT = /(\.\w+)$/

let precompileQueue = Promise.resolve()
const precompiling = []

/**
 * compile dependencies
 *
 * @param {Module}          mod
 * @param {Object}          opts
 * @param {DependenciesMap} opts.dependenciesMap
 * @param {string}          opts.dest            Destination folder
 */
async function compileModule(mod, opts) {
  const { name, version, entry, dir } = mod
  const { dest, mangle, root } = opts

  const args = [
    path.join(__dirname, '../bin/compileModule.js'),
    '--id', path.join(name, version, entry.replace(RE_EXT, '')),
    '--dest', dest,
    '--paths', dir,
    '--root', root,
    '--source-root', '/'
  ]

  if (mangle) {
    args.push('--mangle')
  }

  await spawn(process.argv[0], args, {
    stdio: 'inherit'
  })

  const id = [name, version].join('/')
  for (let i = precompiling.length - 1; i >= 0; i--) {
    if (precompiling[i] === id) precompiling.splice(i, 1)
  }
}


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
    const cacheName = id.replace(RE_EXT, '-' + checksum + '$1')
    const fpath = path.join(this.dest, cacheName)

    if (await exists(fpath)) {
      return await readFile(fpath, 'utf8')
    }
  }

  async write(id, source, content) {
    const md5 = crypto.createHash('md5').update(source)
    const cacheId = id.replace(RE_EXT, '-' + md5.digest('hex') + '$1')
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

  async removeAll(names) {
    const dest = this.dest
    if (names) {
      return names.map(name => rmdir(path.join(dest, name)))
    } else {
      return rmdir(dest)
    }
  }

  precompile(mod, opts) {
    const { dependenciesMap, mangle } = opts
    const { dest, root } = this

    if (precompiling.indexOf(mod.name + '/' + mod.version) >= 0) {
      return
    }

    precompiling.push(mod.name + '/' + mod.version)
    precompileQueue = precompileQueue.then(function() {
      return compileModule(mod, {
        dependenciesMap,
        dest,
        mangle,
        root
      })
    }, function(err) {
      console.error('Failed to cache %s@%s', mod.name, mod.version)
      console.error(err.stack)
    })
  }
}


module.exports = Cache
