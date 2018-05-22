'use strict'

/**
 * This script tests basic functionalities of the Porter class. The reason for this
 * script being in this directory instead of `packages/porter/test` is mostly
 * because want leave packages like `exporess` or `koa` out of porter's devDeps.
 */
const expect = require('expect.js')
const heredoc = require('heredoc').strip
const Koa = require('koa')
const path = require('path')
const Porter = require('@cara/porter')
const request = require('supertest')
const { readFile, writeFile } = require('mz/fs')

const glob = require('../lib/glob')
const app = require('../app')
const pkg = require('../package.json')
const root = path.resolve(__dirname, '..')

function requestPath(urlPath, status = 200, listener = app.callback()) {
  return new Promise(function(resolve, reject) {
    request(listener)
      .get(urlPath)
      .expect(status)
      .end(function(err, res) {
        if (err) reject(err)
        else resolve(res)
      })
  })
}

describe('Porter_readFile()', function() {
  const porter = require('../lib/porter')

  before(async function() {
    await porter.parsePromise
  })

  it('should start from main', async function () {
    const res = await requestPath(`/${pkg.name}/${pkg.version}/home.js?main`)
    expect(res.text).to.contain(`;define("${pkg.name}/${pkg.version}/home.js"`)
    expect(res.text).to.contain(`;porter["import"]("${pkg.name}/${pkg.version}/home.js")`)
  })

  it('should handle components', async function () {
    await requestPath(`/${pkg.name}/${pkg.version}/i18n/index.js`)
    // #36
    await requestPath(`/${pkg.name}/i18n/zh.js`, 404)
    await requestPath('/i18n/zh.js')
  })

  it('should handle dependencies', async function () {
    const { name, version, main } = porter.package.find({ name: 'yen' })
    await requestPath(`/${name}/${version}/${main}`)
  })

  it('should handle recursive dependencies', async function () {
    // object-assign isn't in system's dependencies
    const { name, version, main } = porter.package.find({ name: 'object-assign' })
    await requestPath(`/${name}/${version}/${main}`)
  })

  it('should handle stylesheets', async function () {
    await requestPath(`/${pkg.name}/${pkg.version}/stylesheets/app.css`)
    await requestPath('/stylesheets/app.css')
  })

  it('should serve raw assets too', async function () {
    await requestPath('/raw/logo.jpg')
  })

  it('should handle fake entries', async function() {
    await porter.package.parseFakeEntry({ entry: 'foo.js', deps: [], code: "'use strict'" })
    await requestPath('/foo.js')
  })
})

describe('.func()', function() {
  it('should work with express app', async function() {
    const express = require('express')
    const listener = express().use(new Porter({ root }).func())
    await requestPath(`/${pkg.name}/${pkg.version}/home.js`, 200, listener)
  })
})

describe('{ cache }', function() {
  it('should cache generated style', async function () {
    await requestPath(`/${pkg.name}/${pkg.version}/stylesheets/app.css`)

    const dir = path.join(root, `public/${pkg.name}/${pkg.version}/stylesheets`)
    const entries = (await glob('app-*.css', { cwd: dir })).map(entry => {
      return entry.replace(/-[0-9a-f]{32}\.css$/, '.css')
    })

    expect(entries.length).to.equal(1)
    expect(entries).to.contain('app.css')
  })

  it('should invalidate generated style if source changed', async function () {
    const fpath = path.join(root, 'components/stylesheets/app.css')
    const source = await readFile(fpath, 'utf8')

    await writeFile(fpath, source + heredoc(function() {/*
      div {
        padding: 0;
      }
    */}))

    await requestPath(`/${pkg.name}/${pkg.version}/stylesheets/app.css`)

    const dir = path.join(root, `public/${pkg.name}/${pkg.version}/stylesheets`)
    const entries = (await glob('app-*.css', { cwd: dir })).map(entry => {
      return entry.replace(/-[0-9a-f]{32}\.css$/, '.css')
    })

    expect(entries.length).to.equal(1)
    expect(entries).to.contain('app.css')

    // reset source
    await writeFile(fpath, source)
  })
})

describe('{ source }', function() {
  it('should serve the source of loader.js', async function () {
    await requestPath('/loader.js')
  })

  it('should serve components source', async function () {
    await requestPath('/components/home.js')
  })

  it('should serve dependencies source', async function () {
    await requestPath('/node_modules/yen/index.js')
  })

  it('should not serve source by default', async function () {
    const porter = new Porter({ root })
    const listener = new Koa().use(porter.async()).callback()
    await requestPath('/components/home.js', 404, listener)
  })
})
