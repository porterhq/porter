'use strict'

const Koa = require('koa')
const serve = require('koa-static')
const path = require('path')
const porter = require('../..')

const app = new Koa()
app.use(serve('views'))
app.use(serve('public'))
app.use(porter({
  root: __dirname,
  dest: path.join(__dirname, 'public'),
  cachePersist: true,
  serveSource: true,
  loaderConfig: {
    map: {
      'templates': '/templates'
    }
  }
}))

module.exports = app

if (!module.parent) {
  var PORT = process.env.PORT || 5000

  app.listen(PORT, function() {
    console.log('Server started at %s', PORT)
  })
}
