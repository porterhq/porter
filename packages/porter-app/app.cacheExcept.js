'use strict'

const Koa = require('koa')
const porter = require('@cara/porter')

const app = new Koa()
app.use(porter({
  root: __dirname,
  cacheExcept: 'yen'
}))

module.exports = app
