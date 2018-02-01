'use strict'

const Koa = require('koa')
const serve = require('koa-static')
const path = require('path')
const Porter = require('@cara/porter')

const app = new Koa()
const porter = new Porter({
  root: __dirname,
  paths: ['components', 'browser_modules'],
  dest: path.join(__dirname, 'public'),
  serveSource: true,
  loaderConfig: {
    map: {
      'i18n': '/i18n'
    }
  }
})
app.use(serve('views'))
app.use(serve('public'))
app.use(porter.async())

app.porter = porter
module.exports = app

if (!module.parent) {
  var PORT = process.env.PORT || 5000

  app.listen(PORT, function() {
    console.log('Server started at %s', PORT)
  })
}
