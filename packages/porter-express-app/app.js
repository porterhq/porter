'use strict'

const express =  require('express')
const porter = require('@cara/porter')

const app = express()
app.use(porter({
  root: __dirname,
  cacheExcept: '*',
  type: 'Function'
}))

module.exports = app
