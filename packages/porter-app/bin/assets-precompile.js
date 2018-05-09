#!/usr/bin/env node

'use strict'

const porter = require('../lib/porter')

porter.compileAll({ 
  entries: ['home.js','test/suite.js', 'stylesheets/app.css'] 
})
  .then(function() {
    console.log('done')
  })
  .catch(function(err) {
    console.error(err.stack)
  })
