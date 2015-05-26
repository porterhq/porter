'use strict';

var fs = require('fs')
var path = require('path')
var Promise = require('native-or-bluebird')
var mkdirp = require('mkdirp')

var cmdize = require('./cmd-util/cmdize')


function mkdirpAsync(dir) {
  return new Promise(function(resolve, reject) {
    mkdirp(dir, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function readFileAsync(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(err)
      else resolve(content)
    })
  })
}

function writeFileAsync(fpath, content) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(fpath, content, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}


function compile(opts) {
  var base = opts.base
  var fpath = opts.fpath
  var dest = opts.dest
  var id = opts.id || path.relative(base, fpath)

  var assetPath = path.join(dest, id)
  var assetDir = path.dirname(assetPath)

  return readFileAsync(fpath, 'utf-8')
    .then(function(result) {
      return Promise.all([
        cmdize(id, result),
        mkdirpAsync(assetDir)
      ])
    })
    .then(function(results) {
      return writeFileAsync(assetPath, results[0])
    })
}


module.exports = compile
