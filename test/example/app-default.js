'use strict'

var koa = require('koa')

var oceanify = require('../..')


var app = koa()
app.use(oceanify({
  root: __dirname
}))


module.exports = app
