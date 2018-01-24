#!/usr/bin/env node

'use strict'

const minimist = require('minimist')
const compileAll = require('../lib/compileAll')

const argv = minimist(process.argv.slice(2))

console.log('Compiling %s from %s into %s', argv.id, argv.paths, argv.dest)
compileAll.compileModule(argv.id, {
  dest: argv.dest,
  mangle: argv.mangle,
  paths: argv.paths,
  root: argv.root,
  sourceRoot: argv['source-root'] || '/'
})
  .then(function() {
    process.exit()
  })
  .catch(function(err) {
    console.error(err.stack)
  })
