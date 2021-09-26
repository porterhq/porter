#!/usr/bin/env node

'use strict'

const program = require('commander')

program
  .option('-D --dest [dest]', 'distribute folder', 'dist')
  .option('-E --entry [entry]', 'entry module', '')
  .option('-P --package', 'bundle dependencies at package scope')

program.on('--help', function() {
  console.log('  Examples:')
  console.log('')
  console.log('    $ porter build')
  console.log('    $ porter build node_modules/yen --package')
  console.log('')
})

program.parse(process.argv)

const path = require('path')
const Porter = require('@cara/porter')

const cwd = process.cwd()
const root = program.args.length > 0
  ? path.resolve(cwd, program.args[0])
  : cwd

async function build() {
  const porter = new Porter({
    root,
    paths: '',
    dest: program.dest
  })

  await porter.ready
  if (program.entry) {
    await porter.package.parseEntry(program.entry)
    await porter.compileEntry(program.entry, { package: program.package })
  } else {
    const pkg = require(`${root}/package.json`)
    const main = pkg.browser || pkg.main || 'index.js'
    await porter.package.parseFile(main)
    await porter.compileEntry(main, { package: program.package, loader: false })
  }
}

build().catch(err => console.error(err.stack))
