'use strict'

const request = require('supertest')
const expect = require('expect.js')
const path = require('path')
const heredoc = require('heredoc').strip

const root = path.resolve(__dirname, '../examples/default')
const app = require(`${root}/app`)
const glob = require('../lib/glob')

const { readFile, writeFile, exists, lstat } = require('mz/fs')

function requestPath(apath) {
  return new Promise(function(resolve, reject) {
    request(app.callback())
      .get(apath)
      .expect(200)
      .end(function(err, res) {
        if (err) reject(err)
        else resolve(res)
      })
  })
}

function sleep(seconds) {
  return new Promise(function(resolve) {
    setTimeout(resolve, seconds * 1000)
  })
}


describe('middleware', function() {
  it('should start from main', async function () {
    const res = await requestPath('/porter-app/0.0.1/home.js?main')
    expect(res.text).to.contain('\ndefine("porter-app/0.0.1/home"')
    expect(res.text).to.contain('\nporter["import"]("porter-app/0.0.1/home")')
  })

  it('should handle components', async function () {
    await requestPath('/porter-app/0.0.1/lib/foo.js')
    await requestPath('/lib/foo.js')
  })

  it('should handle dependencies', async function () {
    await requestPath('/yen/1.2.4/index.js')
  })

  it('should handle recursive dependencies', async function () {
    let fpath = path.join(root, 'node_modules/jquery/package.json')

    if (!(await exists(fpath))) {
      fpath = path.join(root, 'node_modules/cropper/node_modules/jquery/package.json')
    }
    const pkg = require(fpath)
    const id = [
      pkg.name,
      pkg.version,
      (pkg.browser || pkg.main).replace(/^\.\//, '')
    ].join('/')

    await requestPath('/' + id)
  })

  it('should handle stylesheets', async function () {
    await requestPath('/porter-app/0.0.1/stylesheets/app.css')
    await requestPath('/stylesheets/app.css')
  })

  it('should serve raw assets too', async function () {
    await requestPath('/raw/logo.jpg')
  })
})


describe('Cache', function() {
  it('should cache generated style', async function () {
    await requestPath('/porter-app/0.0.1/stylesheets/app.css')

    var dir = path.join(root, 'public/porter-app/0.0.1/stylesheets')
    var entries = await glob(path.join(dir, 'app-*.css'))

    entries = entries.map(function(entry) {
      return path.relative(dir, entry).replace(/-[0-9a-f]{32}\.css$/, '.css')
    })

    expect(entries.length).to.equal(1)
    expect(entries).to.contain('app.css')
  })

  it('should invalidate generated style if source changed', async function () {
    var fpath = path.join(root, 'components/stylesheets/app.css')
    var source = await readFile(fpath, 'utf8')

    await writeFile(fpath, source + heredoc(function() {/*
      div {
        padding: 0;
      }
    */}))

    await requestPath('/porter-app/0.0.1/stylesheets/app.css')

    var dir = path.join(root, 'public/porter-app/0.0.1/stylesheets')
    var entries = await glob(path.join(dir, 'app-*.css'))
    entries = entries.map(function(entry) {
      return path.relative(dir, entry).replace(/-[0-9a-f]{32}\.css$/, '.css')
    })

    expect(entries.length).to.equal(1)
    expect(entries).to.contain('app.css')

    // reset source
    await writeFile(fpath, source)
  })

  it('should precompile dependencies', async function () {
    await requestPath('/yen/1.2.4/index.js')
    await sleep(2)

    var fpath = path.join(root, 'public/yen/1.2.4/index.js')
    expect(await exists(fpath)).to.be(true)
  })

  it('should not precompile if not the main of module', async function () {
    var fpath = path.join(root, 'public/yen/1.2.4/index.js')
    var stats = await lstat(fpath)

    await requestPath('/yen/1.2.4/events.js')
    await sleep(2)
    expect((await lstat(fpath)).mtime).to.eql(stats.mtime)
  })

  it('should not precompile if compiled already', async function () {
    var fpath = path.join(root, 'public/yen/1.2.4/index.js')
    var stats = await lstat(fpath)

    await requestPath('/yen/1.2.4/index.js')
    await sleep(2)
    expect((await lstat(fpath)).mtime).to.eql(stats.mtime)
  })
})
