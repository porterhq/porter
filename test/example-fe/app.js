'use strict'

var koa = require('koa')
var serve = require('koa-static')
var path = require('path')

var oceanify = require('../..')


var app = koa()
app.use(serve(__dirname))
app.use(serve('public'))
app.use(oceanify({
  root: __dirname,
  dest: path.join(__dirname, 'public'),
  base: path.join(__dirname, 'test'),
  self: true
}))


module.exports = app

if (!module.parent) {
  var PORT = process.env.PORT || 8000

  app.listen(PORT, function() {
    console.log('Server started at %s', PORT)
  })
}
