'use strict'

var koa = require('koa')

var oceanify = require('./g')


var app = koa()

app.use(oceanify())


module.exports = app
