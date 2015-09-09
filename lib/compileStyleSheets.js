'use strict'

/**
 * @module
 */

var postcss = require('postcss')
var autoprefixer =  require('autoprefixer')
var atImport = require('postcss-import')
var glob = require('glob')
var path = require('path')
var mkdirp = require('mkdirp')
var fs = require('fs')


function globAsync(pattern) {
  return new Promise(function(resolve, reject) {
    glob(pattern, function(err, entries) {
      if (err) reject(err)
      else resolve(entries)
    })
  })
}

function mkdirpAsync(dir) {
  return new Promise(function(resolve, reject) {
    mkdirp(dir, function(err) {
      if (err) reject(err)
      else resolve()
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

function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(new Error(err.message))
      else resolve(content)
    })
  })
}


function* compileStyleSheets(opts) {
  opts = opts || {}
  var cwd = process.cwd()
  var base = path.resolve(cwd, opts.base || 'components')
  var dest = path.resolve(cwd, opts.dest || 'public')
  var match = opts.match || '{main,main/**/*}.css'

  var entries = yield globAsync(path.join(base, match))

  for (var i = 0, len = entries.length; i < len; i++) {
    yield* compileStyleSheet({
      cwd: cwd,
      base: base,
      dest: dest,
      fpath: entries[i],
    })
  }
}


/**
 * Compile styles in components
 *
 * @param {Object} opts
 * @param {string} opts.root
 * @param {string} opts.base
 * @param {string} opts.dest
 */
function* compileStyleSheet(opts) {
  var cwd = process.cwd()
  var base = opts.base
  var dest = opts.dest
  var fpath = opts.fpath

  var destPath = path.join(dest, path.relative(base, fpath))
  var source = yield readFile(fpath)

  var result = postcss()
    .use(autoprefixer())
    .use(atImport({
      path: [ path.join(cwd, 'node_modules') ]
    }))
    .process(source, {
      from: path.relative(cwd, fpath),
      to: path.relative(base, fpath),
      map: { inline: false }
    })

  yield mkdirpAsync(path.dirname(destPath))
  yield [
    writeFile(destPath, result.css),
    writeFile(destPath + '.map', result.map)
  ]
}


module.exports = compileStyleSheets
