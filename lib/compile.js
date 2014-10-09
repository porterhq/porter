'use strict';

var fs = require('fs')
var path = require('path')
var Promise = require('bluebird')
var mkdirp = Promise.promisify(require('mkdirp'))

var cmdize = require('./cmd-util/cmdize')


function compile(opts) {
  var base = opts.base
  var fpath = opts.fpath
  var dest = opts.dest
  var id = opts.id || path.relative(base, fpath)

  var assetPath = path.join(dest, id)
  var assetDir = path.dirname(assetPath)

  return fs.readFileAsync(fpath, 'utf-8')
    .then(function(result) {
      return Promise.all([
        cmdize(id, result),
        mkdirp(assetDir)
      ])
    })
    .then(function(results) {
      return fs.writeFileAsync(assetPath, results[0])
    })
}


module.exports = compile
