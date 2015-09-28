'use strict'

var koa = require('koa')

var oceanify = require('../..')


var app = koa()
app.use(oceanify({
  root: __dirname,
  cacheExcept: 'ez-editor'
}))


module.exports = app
