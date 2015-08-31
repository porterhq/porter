'use strict'

var express =  require('express')
var path = require('path')

var oceanify = require('../..')

var app = express()
app.use(oceanify({
  cwd: path.join(__dirname),
  express: true
}))


module.exports = app
