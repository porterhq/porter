#!/usr/bin/env node

'use strict'

const program = require('commander')

function collectPath(val, paths) {
  paths.push(val)
  return paths
}

program
  .option('-H --headless [headless]', 'run headless tests right after server is started', false)
  .option('-p --port [port]', 'port to listen on', 5000)
  .option('-P --paths [paths]', 'components load path', collectPath, [])
  .option('-s --suite [suite]', 'run suites right after server is started', 'test/suite')
  .option('-t --timeout [timeout]', 'timeout on headless tests', 15000)

program.on('--help', function() {
  console.log('  Examples:')
  console.log('')
  console.log('    $ ocean serve --port 4000')
  console.log('')
})

program.parse(process.argv)

// const debug = require('debug')('porter')
const fs = require('fs')
const http = require('http')
const Koa = require('koa')
const path = require('path')
const puppeteer = require('puppeteer')

const exists = fs.existsSync

const cwd = process.cwd()
const pkgPath = path.join(cwd, 'package.json')

if (!exists(pkgPath)) {
  console.error('Failed to find package.json')
  process.exit()
}

serve().catch(err => console.error(err.stack))

async function test({ port }) {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  const report = result => {
    const [status, { fullTitle, duration, failures, tests }] = result
    switch (status) {
      case 'start':
        console.log('')
        break
      case 'pass':
        console.log(`  ✔ ${fullTitle} (${duration}ms)`)
        break
      case 'fail':
        console.log(`  ✗ ${fullTitle} (${duration}ms)`)
        break
      case 'end':
        console.log('')
        if (failures > 0) {
          console.log(`  ✘ ${failures} of ${tests} test${tests > 1 ? 's' : ''} failed.`)
        } else {
          console.log(`  ${tests} test${tests > 1 ? 's' : ''} completed (${duration}ms)`)
        }
        process.exit(failures)
        break
      default:
        throw new Error(`unknown status '${status}'`)
    }
  }

  const onConsoleMessage = async msg => {
    const args = await Promise.all(msg.args().map(arg => arg.jsonValue()))
    switch (msg.type()) {
      case 'warning':
        console.warn(...args)
        break
      case 'log':
        const text = args[0] == 'stdout:' ? args[1] : args[0]
        let result
        try { result = JSON.parse(text) } catch (err) {}
        if (result) {
          report(result)
        } else {
          console.log(...args)
        }
        break
      default:
        console[msg.type()](...args)
    }
  }

  page.on('console', onConsoleMessage)
  await page.goto(`http://localhost:${port}/runner.html?reporter=json-stream&suite=${program.suite}`, {
    timeout: program.timeout
  })
  await new Promise((resolve, reject) => {
    page.on('error', reject)
    page.on('pageerror', reject)
  })
}

async function serve() {
  const app = new Koa()

  const serveStatic = require('koa-static')
  app.use(serveStatic(path.join(cwd, 'tmp')))
  app.use(serveStatic(path.join(__dirname, '../public')))

  if (program.paths.length == 0) program.paths.push('.')
  const Porter = require('@cara/porter')
  const porter = new Porter({
    paths: [...program.paths, path.join(__dirname, '../public')],
    serveSource: true,
    // If running in headless mode, cache no module
    cacheExcept: '*',
    // but keep from purging exisitng caches by setting `cacheDest` to non-existent path.
    cacheDest: program.headless ? '/tmp/noop' : 'tmp'
  })
  app.use(porter.async())

  const server = http.createServer(app.callback())
  const port = program.headless ? 0 : program.port
  await new Promise((resolve, reject) => {
    server.listen({ port }, resolve)
    server.on('error', reject)
  })
  console.log('Server started at', server.address().port)
  if (program.headless) {
    server.unref()
    await test({ port: server.address().port })
  }
}
