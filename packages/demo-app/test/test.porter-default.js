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
const porter = require('../lib/porter-default')
const request = require('supertest')
const rimraf = require('rimraf')
const util = require('util')
const { exists, readFile, writeFile } = require('mz/fs')

const app = new Koa()
app.use(porter.async())
app.use(async function(ctx, next) {
  if (ctx.path == '/arbitrary-path') {
    ctx.body = 'It works!'
  }
})

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

async function checkReload({ sourceFile, targetFile, pathname }) {
  sourceFile = sourceFile || targetFile
  const sourceModule = await porter.package.parseFile(sourceFile)
  const targetModule = await porter.package.parseFile(targetFile)
  pathname = pathname || `/${targetModule.id}`

  const { fpath: sourcePath } = sourceModule
  const cachePath = path.join(porter.cache.dest, pathname.slice(1))

  const source = await readFile(sourcePath, 'utf8')
  const mark = `/* changed ${Date.now().toString(36)} */`
  await writeFile(sourcePath, `${source}${mark}`)

  try {
    // https://stackoverflow.com/questions/10468504/why-fs-watchfile-called-twice-in-node
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      await porter.package.reload('change', sourceFile)
    } else {
      // {@link Package#watch} takes time to reload
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    expect(await exists(cachePath)).to.not.be.ok()
    await requestPath(pathname)
    expect(await exists(cachePath)).to.be.ok()
    expect(await readFile(cachePath, 'utf8')).to.contain(mark)
  } finally {
    await writeFile(sourcePath, source)
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

describe('Porter_readFile()', function() {
  before(async function() {
    await porter.ready
  })

  it('should start from main', async function () {
    const { name, version } = porter.package
    const res = await requestPath(`/${name}/${version}/home.js?main`)
    expect(res.text).to.contain(`define("${name}/${version}/home.js"`)
    expect(res.text).to.contain(`porter["import"]("${name}/${version}/home.js")`)
  })

  it('should handle components', async function () {
    const { name, version } = porter.package
    await requestPath(`/${name}/${version}/home.js`)
    // #36
    await requestPath(`/${name}/home.js`, 404)
    await requestPath('/home.js')
  })

  it('should bundle relative dependencies of components', async function() {
    const { name, version } = porter.package
    const res = await requestPath(`/${name}/${version}/home.js?main`)
    expect(res.text).to.contain(`define("${name}/${version}/home-dep.js"`)
  })

  it('should bundle json components', async function() {
    const { name, version } = porter.package
    const res = await requestPath(`/${name}/${version}/require-json/suite.js`)
    expect(res.text).to.contain(`define("${name}/${version}/require-json/foo.json"`)
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
    const { name, version } = porter.package
    await requestPath(`/${name}/${version}/stylesheets/app.css`)
    await requestPath('/stylesheets/app.css')
  })

  it('should serve raw assets too', async function () {
    await requestPath('/raw/logo.jpg')
  })

  it('should handle fake entries', async function() {
    await porter.package.parseFakeEntry({ entry: 'baz.js', deps: [], code: "'use strict'" })
    await requestPath('/baz.js')
  })

  it('should handle package bundles', async function() {
    const yen = porter.package.find({ name: 'yen' })
    const { name, version } = yen
    const { bundle } = porter.package.lock[name][version]
    expect(bundle).to.contain('~bundle')
    await requestPath(`/${name}/${version}/${bundle}`)
  })

  it('should hand request over to next middleware', async function() {
    await requestPath('/arbitrary-path')
  })
})

describe('.func()', function() {
  it('should work with express app', async function() {
    const express = require('express')
    const listener = express().use(porter.func())
    const { name, version } = porter.package
    await requestPath(`/${name}/${version}/home.js`, 200, listener)
  })
})

describe('{ cache }', function() {
  it('should cache generated style', async function () {
    const { name, version } = porter.package
    await requestPath(`/${name}/${version}/stylesheets/app.css`)

    const { cache } = porter.package.files['stylesheets/app.css']
    expect(cache.code).to.not.contain('@import')
  })

  it('should invalidate generated style if source changed', async function () {
    await checkReload({
      sourceFile: 'stylesheets/common/base.css',
      targetFile: 'stylesheets/app.css'
    })
  })

  it('should invalidate generated js if source changed', async function() {
    await checkReload({ targetFile: 'home.js' })
  })

  it('should invalidate generated js if dependencies changed', async function() {
    await checkReload({
      sourceFile: 'home-dep.js',
      targetFile: 'home.js'
    })
  })

  // GET /home.js?main
  it('should invalidate generated js of shortcut components', async function() {
    await checkReload({
      sourceFile: 'home-dep.js',
      targetFile: 'home.js',
      pathname: '/home.js'
    })
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
    const listener = new Koa().use(new Porter({ root }).async()).callback()
    await requestPath('/components/home.js', 404, listener)
  })
})

describe('Source Map in Porter_readFile()', function() {
  beforeEach(async function() {
    await util.promisify(rimraf)(path.join(root, 'public'))
  })

  it('should generate source map when accessing /${name}/${version}/${file}', async function() {
    const { name, version } = porter.package
    await requestPath(`/${name}/${version}/home.js`, 200)
    const fpath = path.join(root, `public/${name}/${version}/home.js.map`)
    expect(await exists(fpath)).to.be.ok()

    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('components/home.js')
  })

  it('should generate source map when accessing /${file}', async function() {
    await requestPath('/home.js', 200)
    const fpath = path.join(root, 'public/home.js.map')
    expect(await exists(fpath)).to.be.ok()

    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('components/home.js')
  })

  it('should generate source map when accessing /${name}/${version}/${file}?main', async function() {
    const { name, version } = porter.package
    await requestPath(`/${name}/${version}/home.js?main`, 200)
    const fpath = path.join(root, `public/${name}/${version}/home.js-main.map`)
    expect(await exists(fpath)).to.be.ok()

    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('components/home.js')
    expect(map.sources).to.contain('loader.js')
  })

  it('should generate source map when accessing dependencies', async function() {
    const { name, version, main } = porter.package.find({ name: 'react' })
    await requestPath(`/${name}/${version}/${main}`, 200)
    const fpath = path.join(root, `public/${name}/${version}/${main}.map`)
    expect(await exists(fpath)).to.be.ok()

    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('node_modules/react/index.js')
    expect(map.sources).to.contain('node_modules/react/cjs/react.development.js')
  })
})
