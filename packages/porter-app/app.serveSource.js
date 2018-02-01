'use strict'

const Koa = require('koa')
const Porter = require('@cara/porter')

const app = new Koa()
app.use(new Porter({ root: __dirname }).async())

module.exports = app
