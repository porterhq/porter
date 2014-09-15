'use strict';

var Promise =  require('bluebird')
var compile = require('./compile')
var path = require('path')
var glob = Promise.promisify(require('glob'))
var debug = require('debug')('helmsmen')
var fs = Promise.promisifyAll(require('fs'))


/*
 * Compile all modules under base into target folder.
 *
 * Example:
 *
 *   compileAll('./componets', 'ma/*')
 *   compileAll('./node_modules', '@ali/{belt,matrix,yen}', '.public')
 *
 * Return value:
 *
 *   Promise that will resolve when all compilations finish
 */
function compileAll(opts) {
  var cwd = process.cwd()
  var base = path.resolve(cwd, opts.base || '.')
  var dest = opts.dest ? path.resolve(cwd, opts.dest) : path.join(cwd, 'public')
  var match = opts.match || '*'

  // If the modules reside in node_modules folder, then they might have
  // their own node_modules folders to hold their dependencies.
  //
  // However, we do not support nested dependencies like browserify does.
  // Instead, we require all the dependencies be fatten. So we
  // shall skip these dependencies.
  //
  // The test modules of these modules will be skipped too.
  //
  if (/node_modules/.test(base)) {
    return Promise.all([
      _compileAll(base, path.join(match, '*.js'), dest),
      _compileAll(base, path.join(match, '!(node_modules|test)/**/*.js'), dest)
    ])
      .then(function() {
        return _mergeAll(base, match, dest)
      })
  }
  else {
    return _compileAll(base, path.join(match, '**/*.js'), dest)
  }
}


function _compileAll(base, pattern, dest) {
  // Using Promise#map here
  return glob(path.join(base, pattern)).map(function(fpath) {
    debug('Compiling' + fpath)
    return compile(base, path.relative(base, fpath), dest)
  })
}


function _mergeAll(base, modules, dest) {
  return glob(path.join(base, modules, 'index.js')).map(function(fpath) {
    debug('Merging ' + fpath)
    return _merge(base, path.relative(base, fpath), dest)
  })
}


/*
 * This is the regular expression to extract id and dependencies of
 * the module from the compiled code.
 *
 * Examples:
 *
 *   define("@ali/belt/index",[],function(a,b,c){ ... })
 *   define("@ali/ink/index",["./lib/ink","./lib/display_object"],function(a,b,c){ ... })
 *
 * There is a little gotcha need to be taken care of if the module code is
 * minified by UglifyJS directly. UglifyJS will try to shorten long arrays into
 * something like this:
 *
 *   ['./lib/ink','./lib/display_object', ... , './lib/text']
 *   './lib/ink,./lib/display_object, ... ,./lib/text'.split(',')
 *
 * The latter one will be shorter than the former once the array length is long enough.
 * But since we only use UglifyJS to minify factory code, and the define(id, deps) part
 * is put together via ./compile. This is no longer an issue.
 */
var RE_DEFINE = /define\("(.*?)",(\[.*?\])/

function _merge(base, id, target) {
  var added = {}
  var codes = []

  function __merge(base, id) {
    return fs.readFileAsync(path.join(base, id), 'utf-8').then(function(result) {
      var meta = result.match(RE_DEFINE)
      var id = meta[1]

      if (added[id]) return

      added[id] = true
      codes.push(result)

      return Promise.map(JSON.parse(meta[2]), function(dep) {
        if (dep[0] !== '.') return
        dep = path.join(path.dirname(id), dep + '.js')
        return __merge(base, dep)
      })
    })
  }

  // We are processing the minified code here. Hence using target as the base directory.
  return __merge(target, id).then(function() {
    return fs.writeFileAsync(path.join(target, id), codes.join('\n'))
  })
}


module.exports = compileAll
