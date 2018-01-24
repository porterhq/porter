'use strict'

const express =  require('express')
const porter = require('@cara/porter')

const app = express()
app.use(porter({
  root: __dirname,
  cacheExcept: '*',
  express: true
}))

module.exports = app
