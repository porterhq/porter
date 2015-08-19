'use strict'

var koa = require('koa')
var serve = require('koa-static')
var path = require('path')

var oceanify = require('../../g')


var app = koa()
app.use(serve('public'))
app.use(serve('views'))
app.use(oceanify({ cwd: __dirname, dest: path.join(__dirname, 'public') }))


module.exports = app

if (!module.parent) {
  var PORT = process.env.PORT || 8000

  app.listen(PORT, function() {
    console.log('Server started at %s', PORT)
  })
}
