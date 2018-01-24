'use strict'

const babel = require('babel-core')

function transform(code, opts) {
  return babel.transform(code, Object.assign({
    sourceMaps: true,
    sourceRoot: '/',
    ast: false,
  }, opts))
}

module.exports = transform
