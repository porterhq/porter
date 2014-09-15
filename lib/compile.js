'use strict';

var fs = require('fs')
var path = require('path')
var Promise = require('bluebird')
var mkdirp = Promise.promisify(require('mkdirp'))

var cmdize = require('./cmd-util/cmdize')


function compile(base, id, dest) {
  var fpath = path.join(base, id)
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
    .catch(function(err) {
      console.error('Error occured when compiling %s', id)
      console.error(err.stack)
    })
}


module.exports = compile
