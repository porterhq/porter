#!/usr/bin/env node

'use strict'

const debug = require('debug')('porter')
const minimist = require('minimist')
const path = require('path')
const Porter = require('..')

// argv.paths should be the path of the module to compile
const argv = minimist(process.argv.slice(2))
const { root, paths, dest, name, version, entry } = argv
const porter = new Porter({ root, paths, dest })

debug('compiling %s/%s/%s from %s into %s',
  name, version, entry, path.relative(root, argv.paths), path.relative(root, argv.dest)
)

porter.compileModule({ name, version, entry }, {
  paths,
  mangle: argv.mangle,
  enableEnvify: argv.envify,
  enableTransform: argv.transform,
  sourceRoot: argv['source-root'] || '/'
})
  .catch(function(err) {
    console.error(err.stack)
  })
