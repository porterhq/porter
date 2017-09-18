'use strict'

const express =  require('express')

const oceanify = require('../..')

const app = express()
app.use(oceanify({
  root: __dirname,
  express: true
}))


module.exports = app
