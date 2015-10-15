#!/usr/bin/env node --harmony

'use strict'

var minimist = require('minimist')
var co = require('co')

var compileAll = require('../lib/compileAll')


var argv = minimist(process.argv.slice(2))


console.log('Compiling %s from %s into %s', argv.id, argv.base, argv.dest)

co(compileAll.compileModule(argv.id, {
  base: argv.base,
  dest: argv.dest,
  sourceRoot: argv['source-root'] || '/'
}))
  .then(function() {
    process.exit()
  })
  .catch(function(err) {
    console.error(err.stack)
  })
