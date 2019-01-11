#!/usr/bin/env node

'use strict'

const program = require('commander')
const pkg = require('../package')


program
  .version(pkg.version)
  .command('build', 'Build current package')
  .command('serve', 'Serve current directory as local component')

program.on('--help', function() {
  console.log('  Examples:')
  console.log('')
  console.log('    $ porter build')
  console.log('    $ porter serve')
  console.log('')
})

program.parse(process.argv)
