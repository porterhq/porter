'use strict'

const koa = require('koa')
const porter = require('../..')

const app = koa()
app.use(porter({ root: __dirname }))

module.exports = app
