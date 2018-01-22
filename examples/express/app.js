'use strict'

const express =  require('express')
const porter = require('../..')

const app = express()
app.use(porter({
  root: __dirname,
  express: true
}))

module.exports = app
