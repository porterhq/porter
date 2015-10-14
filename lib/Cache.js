'use strict'

/**
 * @module
 */

var co = require('co')
var fs = require('fs')
var path = require('path')
var crypto = require('crypto')
var mkdirp = require('mkdirp')
var objectAssign = require('object-assign')
var _spawn = require('child_process').spawn
var debug = require('debug')('oceanify')
var semver = require('semver')

var findModule = require('./findModule')


function exists(fpath) {
  return new Promise(function(resolve) {
    fs.exists(fpath, resolve)
  })
}

function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(new Error(err.message))
      else resolve(content)
    })
  })
}

function writeFile(fpath, content) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(fpath, content, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function readdir(dir) {
  return new Promise(function(resolve, reject) {
    fs.readdir(dir, function(err, entries) {
      if (err) reject(err)
      else resolve(entries)
    })
  })
}

function lstat(fpath) {
  return new Promise(function(resolve, reject) {
    fs.lstat(fpath, function(err, stats) {
      if (err) reject(err)
      else resolve(stats)
    })
  })
}

function unlink(fpath) {
  return new Promise(function(resolve, reject) {
    fs.unlink(fpath, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function mkdirpAsync(dir, opts) {
  return new Promise(function(resolve, reject) {
    mkdirp(dir, opts || {}, function(err, made) {
      if (err) reject(err)
      else resolve(made)
    })
  })
}

function spawn(command, args, opts) {
  return new Promise(function(resolve, reject) {
    var proc = _spawn(command, args, opts)

    proc.on('exit', function(code) {
      if (code === 0) resolve()
      else reject()
    })
  })
}


var RE_EXT = /(\.\w+)$/

var precompileQueue = Promise.resolve()
var precompiling = []


/**
 * Precompile dependencies
 *
 * @param {Module}          mod
 * @param {Object}          opts
 * @param {DependenciesMap} opts.dependenciesMap
 * @param {string}          opts.dest            Destination folder
 */
function* precompile(mod, opts) {
  var dependenciesMap = opts.dependenciesMap
  var dest = opts.dest
  var fpath = findModule(mod, dependenciesMap)

  while (fpath && !/node_modules$/.test(fpath)) {
    fpath = path.dirname(fpath)
  }

  if (!(yield exists(fpath))) {
    console.error('Failed to find module %s', mod.name)
    return
  }

  var stats = yield lstat(path.join(fpath, mod.name))
  if (stats.isSymbolicLink()) {
    debug('Disabled cache of module %s bacause it\'s symbolic link', mod.name)
    return
  }

  var args = [
    path.join(__dirname, '../bin/compileModule.js'),
    '--id', path.join(mod.name, mod.version, mod.entry.replace(RE_EXT, '')),
    '--base', fpath,
    '--dest', dest,
    '--source-root', '/'
  ]

  if (semver.lt(process.versions.node, '1.0.0')) {
    args.unshift('--harmony')
  }

  yield spawn(process.argv[0], args, {
    stdio: 'inherit'
  })

  var id = [mod.name, mod.version].join('/')
  for (var i = precompiling.length - 1; i >= 0; i--) {
    if (precompiling[i] === id) precompiling.splice(i, 1)
  }
}


/**
 * Cache
 * @constructor
 * @param {Object} opts
 * @param {string} opts.dest     Where to store the cached files
 * @param {string} opts.encoding The encoding of the source files
 */
function Cache(opts) {
  var dest = opts.dest

  if (!dest) {
    throw new Error('Please specify the cache destination folder.')
  }

  this.dest = dest
  this.encoding = opts.encoding

  co(this.removeAll()).then(function() {
    debug('Cache %s cleared', dest)
  })
}

objectAssign(Cache.prototype, {
  read: function* (id, source) {
    var checksum = crypto.createHash('md5').update(source).digest('hex')
    var cacheName = id.replace(RE_EXT, '-' + checksum + '$1')
    var fpath = path.join(this.dest, cacheName)

    if (yield exists(fpath)) {
      return yield readFile(fpath, this.encoding)
    }
  },

  write: function* (id, source, content) {
    var md5 = crypto.createHash('md5').update(source)
    var cacheId = id.replace(RE_EXT, '-' + md5.digest('hex') + '$1')
    var fpath = path.join(this.dest, cacheId)

    yield this.remove(id, cacheId)
    yield mkdirpAsync(path.dirname(fpath))
    yield writeFile(fpath, content)
  },

  writeFile: function* (id, content) {
    var fpath = path.join(this.dest, id)

    yield mkdirpAsync(path.dirname(fpath))
    yield writeFile(fpath, content)
  },

  remove: function* (id) {
    var fname = path.basename(id)
    var dir = path.join(this.dest, path.dirname(id))

    if (!(yield exists(dir))) return

    var entries = yield readdir(dir)

    for (var i = 0, len = entries.length; i < len; i++) {
      var entry = entries[i]
      if (entry.replace(/-[0-9a-f]{32}(\.(?:js|css))$/, '$1') === fname) {
        yield unlink(path.join(dir, entry))
      }
    }
  },

  removeAll: function* () {
    var dest = this.dest

    debug('rm -rf ' + dest)
    yield spawn('rm', [ '-rf', dest ], { stdio: 'inherit' })
  },

  precompile: function(mod, opts) {
    var system = opts.system
    var dest = this.dest

    if (precompiling.indexOf(mod.name + '/' + mod.version) >= 0) {
      return
    }

    precompiling.push(mod.name + '/' + mod.version)
    var data = system.modules[mod.name][mod.version]
    var main = data.main
      ? data.main.replace(/^\.\//, '').replace(/\.js$/, '')
      : 'index'

    if (main + '.js' !== mod.entry) {
      return
    }

    precompileQueue = precompileQueue.then(function() {
      return co(precompile(mod, {
        dependenciesMap: opts.dependenciesMap,
        dest: dest
      }))
    }, function(err) {
      console.error('Failed to cache %s@%s', mod.name, mod.version)
      console.error(err.stack)
    })
  }
})


module.exports = Cache
