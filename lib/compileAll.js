'use strict';

var Promise =  require('bluebird')
var path = require('path')
var glob = Promise.promisify(require('glob'))
var debug = require('debug')('golem')
var fs = Promise.promisifyAll(require('fs'))

var _compile = require('./compile')


/*
 * Compile all modules under base into target folder.
 *
 * Example:
 *
 *   compileAll({ base: './componets', match: 'ma/*' })
 *   compileAll({ base: './node_modules', match: '@ali/{belt,matrix,yen}', dest: './public' })
 *
 * Return value:
 *
 *   A promise that will be resolved when all compilations finish
 */
function compileAll(opts) {
  var cwd = process.cwd()
  var base = path.resolve(cwd, opts.base || '.')
  var dest = path.resolve(cwd, opts.dest || './public')
  var match = opts.match || '*'

  // If the modules reside in node_modules folder, then they might have
  // their own node_modules folders to hold their dependencies.
  //
  // However, we do not support nested dependencies like browserify does.
  // Instead, we require all the dependencies be fatten. So we
  // shall skip these dependencies.
  //
  // The test modules of these modules should be skipped too.
  //
  if (path.basename(base) == 'node_modules')
    return _compileComponents({ base: base, match: match, dest: dest })
  else if (opts.component)
    return _compileComponent({ base: opts.component, dest: dest })
  else
    return _compileAll({ base: base, match: match, dest: dest })
}


function _compileComponents(opts) {
  var base = opts.base
  var match = opts.match
  var dest = opts.dest

  return glob(path.join(base, match)).map(function(component) {
    return _compileComponent({ base: component, dest: dest })
  })
}


function _compileComponent(opts) {
  var base = opts.base
  var dest = opts.dest
  var pkg

  return Promise.all([
    glob(path.join(base, '*.js')),
    glob(path.join(base, '!(node_modules|test)/**/*.js')),
    fs.readFileAsync(path.join(base, 'package.json'), 'utf-8')
  ])
    .then(function(results) {
      pkg = JSON.parse(results.pop())
      debug('Compiling component ' + pkg.name + '@' + pkg.version)
      return results[0].concat(results[1])
    })
    .map(function(fpath) {
      var id = [pkg.name, pkg.version, path.relative(base, fpath)].join('/')
      return _compile({ base: base, fpath: fpath, id: id, dest: dest })
    })
    .then(function() {
      return _merge({ id: [pkg.name, pkg.version, 'index.js'].join('/'), dest: dest })
    })
}


function _compileAll(opts) {
  var base = opts.base
  var match = opts.match
  var dest = opts.dest
  var pattern = path.join(match, '**/*.js')

  // Using Promise#map here
  return glob(path.join(base, pattern)).map(function(fpath) {
    debug('Compiling ' + fpath)
    return _compile({ base: base, fpath: fpath, dest: dest })
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

function _merge(opts) {
  var id = opts.id
  var dest = opts.dest

  var fpath = path.join(dest, id)
  var added = {}
  var codes = []

  function __merge(fpath) {
    return fs.readFileAsync(fpath, 'utf-8').then(function(result) {
      var meta = result.match(RE_DEFINE)
      var id = meta[1]

      if (added[id]) return

      added[id] = true
      codes.push(result)

      return Promise.map(JSON.parse(meta[2]), function(dep) {
        if (dep[0] !== '.') return
        dep = path.join(path.dirname(id), dep + '.js')
        return __merge(path.join(dest, dep))
      })
    })
  }

  // We are processing the minified code here. Hence using dest as the base directory.
  return __merge(fpath).then(function() {
    return fs.writeFileAsync(fpath, codes.join('\n'))
  })
}


module.exports = compileAll
