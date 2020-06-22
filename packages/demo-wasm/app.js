'use strict'

const Koa = require('koa')
const serve = require('koa-static')
const Porter = require('@cara/porter')

const app = new Koa()
const porter = new Porter({
  source: {
    serve: true,
    root: 'http://localhost:5000',
  },
  transpile: {
    only: [ '@cara/hello-wasm' ],
  }
})

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
