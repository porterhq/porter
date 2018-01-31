#!/usr/bin/env node

'use strict'

const debug = require('debug')('porter')
const minimist = require('minimist')
const Porter = require('..')

const argv = minimist(process.argv.slice(2))
const { root, paths, dest } = argv
const porter = new Porter({ root, paths, dest })

debug('Compiling %s from %s into %s', argv.id, argv.paths, argv.dest)
porter.compileModule(argv.id, {
  mangle: argv.mangle,
  sourceRoot: argv['source-root'] || '/'
})
  .catch(function(err) {
    console.error(err.stack)
  })
