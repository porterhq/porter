'use strict'

var fs = require('fs')
var path = require('path')
var Promise = require('native-or-bluebird')
var mkdirp = require('mkdirp')

var parse = require('./parse')
var cmdize = require('./cmd-util/cmdize')

var RE_NODE_MODULES = /node_modules\/?$/


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
      if (err) reject(new Error(err.message))
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

  function compileComponent(result) {
    var content = result[0]
    var minified = cmdize(id, content)
    var meta = parse(content)
    var aliasPath = assetPath.replace(/\.js/, '-' + meta.digest.slice(0, 8) + '.js')

    return Promise.all([
      writeFileAsync(assetPath, minified),
      writeFileAsync(aliasPath, minified)
    ])
  }

  function compileFile(result) {
    return writeFileAsync(assetPath, cmdize(id, result[0]))
  }

  return Promise.all([
    readFileAsync(fpath, opts.encoding || 'utf-8'),
    mkdirpAsync(assetDir)
  ])
    .then(RE_NODE_MODULES.test(base) ? compileFile : compileComponent)
}


module.exports = compile
