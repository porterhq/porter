'use strict'

const Koa = require('koa')
const serve = require('koa-static')

const app = new Koa()
const porter = require('./lib/porter')
app.use(serve('views'))
app.use(serve('public'))
app.use(porter.async())

module.exports = app

if (!module.parent) {
  const PORT = process.env.PORT || 5000
  app.listen(PORT, function() {
    console.log('Server started at %s', PORT)
  })
}
