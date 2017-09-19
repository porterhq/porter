'use strict'

const koa = require('koa')

const oceanify = require('../..')


const app = koa()
app.use(oceanify({ root: __dirname }))


module.exports = app
