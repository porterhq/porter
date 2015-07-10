'use strict'

var crypto = require('crypto')

var ast = require('./cmd-util/ast')

var cache = {}
var RE_DEFINE = /^define\(/


function parse(code) {
  if (!RE_DEFINE.test(code)) {
    code = 'define(function(require, exports, module) {' + code + '})'
  }
  var md5 = crypto.createHash('md5')

  md5.update(code)

  var digest = md5.digest('hex')
  var meta

  if (digest in cache) {
    meta = cache[digest]
  } else {
    meta = ast.parseFirst(code)
    meta.digest = digest
    cache[digest] = meta
  }

  return meta
}


module.exports = parse
