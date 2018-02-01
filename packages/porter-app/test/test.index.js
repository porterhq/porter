'use strict'

const request = require('supertest')
const expect = require('expect.js')
const path = require('path')
const heredoc = require('heredoc').strip

const root = path.resolve(__dirname, '..')
const app = require('../app')
const pkg = require('../package.json')
const glob = require('../lib/glob')

const { readFile, writeFile, exists, lstat, unlink } = require('mz/fs')

function requestPath(urlPath, status = 200, mockApp = app.callback()) {
  return new Promise(function(resolve, reject) {
    request(mockApp)
      .get(urlPath)
      .expect(status)
      .end(function(err, res) {
        if (err) reject(err)
        else resolve(res)
      })
  })
}

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}

describe('.async()', function() {
  const { porter } = app

  before(async function() {
    await porter.parsePromise
  })

  it('should start from main', async function () {
    const res = await requestPath(`/${pkg.name}/${pkg.version}/home.js?main`)
    expect(res.text).to.contain(`\ndefine("${pkg.name}/${pkg.version}/home"`)
    expect(res.text).to.contain(`\nporter["import"]("${pkg.name}/${pkg.version}/home")`)
  })

  it('should handle components', async function () {
    await requestPath(`/${pkg.name}/${pkg.version}/i18n/index.js`)
    // #36
    await requestPath(`/${pkg.name}/i18n/zh.js`, 404)
    await requestPath('/i18n/zh.js')
  })

  it('should handle dependencies', async function () {
    const name = 'yen'
    const { version, main } = porter.findMap({ name })
    await requestPath(`/${name}/${version}/${main}.js`)
  })

  it('should handle recursive dependencies', async function () {
    // object-assign isn't in system's dependencies
    const name = 'object-assign'
    const { version, main } = porter.findMap({ name })
    await requestPath(`/${name}/${version}/${main}.js`)
  })

  it('should handle stylesheets', async function () {
    await requestPath(`/${pkg.name}/${pkg.version}/stylesheets/app.css`)
    await requestPath('/stylesheets/app.css')
  })

  it('should serve raw assets too', async function () {
    await requestPath('/raw/logo.jpg')
  })
})

describe('.func()', function() {
  it('should work with express app', async function() {
    await requestPath(`/${pkg.name}/${pkg.version}/home.js`, 200, require('../app.func'))
  })
})

describe('Cache', function() {
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

describe('.cacheModule()', function() {
  it('should precompile dependencies', async function () {
    await requestPath('/yen/1.2.4/index.js')
    await sleep(2)

    const fpath = path.join(root, 'public/yen/1.2.4/index.js')
    expect(await exists(fpath)).to.be.ok()
  })

  it('should not precompile if not the main of module', async function () {
    const fpath = path.join(root, 'public/yen/1.2.4/index.js')
    const stats = await lstat(fpath)

    await requestPath('/yen/1.2.4/events.js')
    await sleep(2)
    expect((await lstat(fpath)).mtime).to.eql(stats.mtime)
  })

  it('should not precompile if compiled already', async function () {
    const fpath = path.join(root, 'public/yen/1.2.4/index.js')
    const stats = await lstat(fpath)

    await requestPath('/yen/1.2.4/index.js')
    await sleep(2)
    expect((await lstat(fpath)).mtime).to.eql(stats.mtime)
  })
})

describe('{ cacheExcept }', function() {
  const fpath = path.join(root, 'public/yen/1.2.4/index.js')

  before(async function() {
    try { await unlink(fpath) } catch (err) {}
  })

  it('should skip compilation if within cache exceptions', async function () {
    await requestPath('/yen/1.2.4/index.js', 200, require('../app.cacheExcept').callback())
    await sleep(1)
    expect(await exists(fpath)).to.be(false)
  })
})

describe('{ serveSource }', function() {
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
    await requestPath('/components/home.js', 404, require('../app.serveSource').callback())
  })
})
