'use strict'

var koa = require('koa')

var oceanify = require('../..')


var app = koa()
app.use(oceanify({
  root: __dirname,
  serveSource: true
}))


module.exports = app
