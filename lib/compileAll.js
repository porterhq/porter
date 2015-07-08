'use strict'

var Promise = require('native-or-bluebird')
var path = require('path')
var glob = require('glob')
var debug = require('debug')('oceanify')

var _compile = require('./compile')
var _compileModule = require('./compileModule')


function globAsync(pattern) {
  return new Promise(function(resolve, reject) {
    glob(pattern, function(err, entries) {
      if (err) reject(err)
      else resolve(entries)
    })
  })
}


/*
 * Compile all modules under base into target folder.
 *
 * Example:
 *
 *   compileAll({ base: './components', match: 'ma/*' })
 *   compileAll({ base: './node_modules', match: '{semver,heredoc}', dest: './public' })
 *
 * Return value:
 *
 *   A promise that will be resolved when all compilations finish
 */
function compileAll(opts) {
  var cwd = opts.cwd || process.cwd()
  var base = path.resolve(cwd, opts.base || '.')
  var dest = path.resolve(cwd, opts.dest || './public')
  var match = opts.match || '*'

  /*
   * If the modules reside in node_modules folder, then they might have
   * their own node_modules folders to hold their dependencies.
   *
   * However, we do not support nested dependencies like browserify does.
   * Instead, we require all the dependencies be flatten. So we
   * shall skip these dependencies.
   *
   * The test modules of these modules should be skipped too.
   */
  if (path.basename(base) === 'node_modules') {
    return _compileModules({ base: base, match: match, dest: dest })
  } else {
    return _compileAll({ base: base, match: match, dest: dest })
  }
}


function _compileModules(opts) {
  var base = opts.base
  var match = opts.match
  var dest = opts.dest

  return globAsync(path.join(base, match)).then(function(fpaths) {
    return Promise.all(fpaths.map(function(fpath) {
      return _compileModule({
        base: base,
        name: path.relative(base, fpath),
        dest: dest
      })
    }))
  })
}


function _compileAll(opts) {
  var base = opts.base
  var match = opts.match
  var dest = opts.dest
  var pattern = path.join(match, '**/*.js')

  // Using Promise#map here
  return globAsync(path.join(base, pattern)).then(function(fpaths) {
    return Promise.all(fpaths.map(function(fpath) {
      debug('Compiling ' + fpath)
      return _compile({ base: base, fpath: fpath, dest: dest })
    }))
  })
}


module.exports = compileAll
