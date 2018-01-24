#!/usr/bin/env node --harmony

'use strict'

const program = require('commander')

program
  .option('-p --port [port]', 'port to listen on', 5000)
  .option('-P --paths [paths]', 'components load path', '.')

program.on('--help', function() {
  console.log('  Examples:')
  console.log('')
  console.log('    $ ocean serve --port 4000')
  console.log('')
})

program.parse(process.argv)


const path = require('path')
const fs = require('fs')
const Koa = require('koa')

const exists = fs.existsSync


const cwd = process.cwd()
const opts = {
  paths: program.paths,
  cachePersist: true,
  dest: 'tmp'
}

const pkgPath = path.join(cwd, 'package.json')


if (!exists(pkgPath)) {
  console.error('Failed to find package.json')
  process.exit()
}

serve()


function serve() {
  const app = new Koa()

  const serveStatic = require('koa-static')
  app.use(serveStatic(cwd))
  app.use(serveStatic(path.join(cwd, 'tmp')))

  const porter = require('@cara/porter')
  app.use(porter(opts))

  app.listen(program.port, function() {
    console.log('Server started at', program.port)
  })
}
