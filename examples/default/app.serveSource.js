'use strict'

const Koa = require('koa')
const porter = require('../..')

const app = new Koa()
app.use(porter({ root: __dirname }))

module.exports = app
