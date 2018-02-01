'use strict'

const Koa = require('koa')
const Porter = require('@cara/porter')

const app = new Koa()
app.use(new Porter({ root: __dirname, cacheExcept: 'yen' }).async())

module.exports = app
