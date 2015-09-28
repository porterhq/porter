'use strict'

var express =  require('express')

var oceanify = require('../..')

var app = express()
app.use(oceanify({
  root: __dirname,
  express: true
}))


module.exports = app
