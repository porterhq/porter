#!/usr/bin/env node

'use strict'

const program = require('commander')
const pkg = require('../package')


program
  .version(pkg.version)
  .command('ip', 'Get local ip')
  .command('serve', 'Serve current directory as local component')

program.on('--help', function() {
  console.log('  Examples:')
  console.log('')
  console.log('    $ ocean ip')
  console.log('    $ ocean serve')
  console.log('')
})

program.parse(process.argv)
