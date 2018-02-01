'use strict'

const express =  require('express')
const Porter = require('@cara/porter')

const app = express()
app.use(new Porter({ root: __dirname }).func())

module.exports = app
