'use strict'

const koa = require('koa')
const serve = require('koa-static')
const path = require('path')

const oceanify = require('../..')


const app = koa()
app.use(serve('views'))
app.use(serve('public'))
app.use(oceanify({
  root: __dirname,
  dest: path.join(__dirname, 'public'),
  loaderConfig: {
    map: {
      'templates': '/templates'
    }
  }
}))


module.exports = app

if (!module.parent) {
  var PORT = process.env.PORT || 4000

  app.listen(PORT, function() {
    console.log('Server started at %s', PORT)
  })
}
