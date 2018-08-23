'use strict'

/**
 * This script tests basic functionalities of the Porter class. The reason for this
 * script being in this directory instead of `packages/porter/test` is mostly
 * because want leave packages like `exporess` or `koa` out of porter's devDeps.
 */
const expect = require('expect.js')
const Koa = require('koa')
const path = require('path')
const Porter = require('@cara/porter')
const request = require('supertest')
const { exists, readFile, writeFile } = require('mz/fs')

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
    await porter.ready
  })

  it('should start from main', async function () {
    const { name, version } = pkg
    const res = await requestPath(`/${name}/${version}/home.js?main`)
    expect(res.text).to.contain(`define("${name}/${version}/home.js"`)
    expect(res.text).to.contain(`porter["import"]("${name}/${version}/home.js")`)
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

  it('should handle package bundles', async function() {
    const fbjs = porter.package.find({ name: 'fbjs' })
    const { name, version } = fbjs
    const { bundle } = porter.package.lock[name][version]
    await requestPath(`/${name}/${version}/${bundle}`)
  })

  it('should hand request over to next middleware', async function() {
    await requestPath('/arbitray-path')
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
  const porter = require('../lib/porter')

  it('should cache generated style', async function () {
    const { name, version } = pkg
    await requestPath(`/${name}/${version}/stylesheets/app.css`)

    const { cache } = porter.package.files['stylesheets/app.css']
    expect(cache.code).to.not.contain('@import')
  })

  it('should invalidate generated style if source changed', async function () {
    const { name, version } = pkg
    const fpath = path.join(root, 'components/stylesheets/app.css')
    const source = await readFile(fpath, 'utf8')
    const mark = `/* changed ${Date.now().toString(36)} */`

    await writeFile(fpath, `${source}${mark}`)
    // {@link Package#watch} takes time to reload
    await new Promise(resolve => setTimeout(resolve, 1000))

    const mod = porter.package.files['stylesheets/app.css']

    // https://stackoverflow.com/questions/10468504/why-fs-watchfile-called-twice-in-node
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      await mod.reload()
    }

    await requestPath(`/${name}/${version}/stylesheets/app.css`)
    expect(mod.cache.code).to.contain(mark)

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

describe('Source Map in Porter_readFile()', function() {
  // customize porter instance to disable preload.
  const porter = new Porter({
    root,
    paths: ['components', 'browser_modules'],
    entries: ['home.js', 'test/suite.js']
  })
  const listener = new Koa().use(porter.async()).callback()

  it('should generate source map when accessing /${name}/${version}/${file}', async function() {
    const { name, version } = pkg
    await requestPath(`/${name}/${version}/home.js`, 200, listener)
    const fpath = path.join(root, `public/${name}/${version}/home.js.map`)
    expect(await exists(fpath)).to.be.ok()

    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('components/home.js')
  })

  it('should generate source map when accessing /${file}', async function() {
    await requestPath('/home.js', 200, listener)
    const fpath = path.join(root, 'public/home.js.map')
    expect(await exists(fpath)).to.be.ok()

    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('components/home.js')
  })

  it('should generate source map when accessing /${name}/${version}/${file}?main', async function() {
    const { name, version } = pkg
    await requestPath(`/${name}/${version}/home.js?main`, 200, listener)
    const fpath = path.join(root, `public/${name}/${version}/home.js-main.map`)
    expect(await exists(fpath)).to.be.ok()

    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('components/home.js')
    expect(map.sources).to.contain('loader.js')
  })

  it('should generate source map when accessing dependencies', async function() {
    const { name, version, main } = porter.package.find({ name: 'react' })
    await requestPath(`/${name}/${version}/${main}`, 200, listener)
    const fpath = path.join(root, `public/${name}/${version}/${main}.map`)
    expect(await exists(fpath)).to.be.ok()

    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('node_modules/react/index.js')
    expect(map.sources).to.contain('node_modules/react/cjs/react.development.js')
  })
})
