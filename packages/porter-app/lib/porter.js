'use strict'

const path = require('path')
const Porter = require('@cara/porter')

module.exports = new Porter({
  root: path.join(__dirname, '..'),
  paths: ['components', 'browser_modules'],
  dest: 'public',
  source: {
    serve: true
  },
  preload: 'preload',
  map: {
    'i18n': '/i18n'
  }
})