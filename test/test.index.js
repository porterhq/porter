'use strict'

require('co-mocha')
const request = require('supertest')
const expect = require('expect.js')
const path = require('path')
const heredoc = require('heredoc').strip

const app = require('./example/app')
const fs = require('../lib/fs')
const glob = require('../lib/glob')

const readFile = fs.readFile
const writeFile = fs.writeFile
const exists = fs.exists
const lstat = fs.lstat

function requestPath(apath) {
  return new Promise(function(resolve, reject) {
    request(app.callback())
      .get(apath)
      .expect(200)
      .end(function(err, res) {
        if (err) reject(new Error(err))
        else resolve(res)
      })
  })
}

function sleep(seconds) {
  return new Promise(function(resolve) {
    setTimeout(resolve, seconds * 1000)
  })
}


describe('oceanify', function() {
  it('should start from main', function* () {
    var res = yield requestPath('/oceanify-example/0.0.1/main.js?main')
    expect(res.text).to.contain('\ndefine("oceanify-example/0.0.1/main"')
    expect(res.text).to.contain('\noceanify["import"]("oceanify-example/0.0.1/main")')
  })

  it('should handle components', function *() {
    yield requestPath('/oceanify-example/0.0.1/ma/nga.js')
  })

  it('should handle dependencies', function* () {
    yield requestPath('/yen/1.2.4/index.js')
  })

  /**
   * inherits is a dependency of ez-editor. In npm@2, inherits will be put in
   * the node_modules directory of ez-editor. But since npm@3 fattens the
   * node_modules tree. This is no longer a guarantee. So let's just try both
   * places. The original purpose of this test is no longer valid in npm@3 though.
   */
  it('should handle recursive dependencies', function* () {
    const root = path.join(__dirname, 'example/node_modules')
    let fpath = path.join(root, 'ez-editor/node_modules/inherits/package.json')

    if (!(yield exists(fpath))) {
      fpath = path.join(root, 'inherits/package.json')
    }
    const pkg = JSON.parse(yield readFile(fpath, 'utf8'))
    const id = [
      pkg.name,
      pkg.version,
      pkg.browser.replace(/^\.\//, '')
    ].join('/')

    yield requestPath('/' + id)
  })

  it('should handle stylesheets', function* () {
    yield requestPath('/oceanify-example/0.0.1/stylesheets/app.css')
  })

  it('should serve raw assets too', function* () {
    yield requestPath('/raw/logo.jpg')
  })
})


describe('oceanify Cache', function() {
  var root = path.join(__dirname, 'example')

  it('should cache generated style', function* () {
    yield requestPath('/oceanify-example/0.0.1/stylesheets/app.css')

    var dir = path.join(root, 'public/oceanify-example/0.0.1/stylesheets')
    var entries = yield glob(path.join(dir, 'app-*.css'))

    entries = entries.map(function(entry) {
      return path.relative(dir, entry).replace(/-[0-9a-f]{32}\.css$/, '.css')
    })

    expect(entries.length).to.equal(1)
    expect(entries).to.contain('app.css')
  })

  it('should invalidate generated style if source changed', function* () {
    var fpath = path.join(root, 'components/stylesheets/app.css')
    var source = yield readFile(fpath, 'utf8')

    yield writeFile(fpath, source + heredoc(function() {/*
      div {
        padding: 0;
      }
    */}))

    yield requestPath('/oceanify-example/0.0.1/stylesheets/app.css')

    var dir = path.join(root, 'public/oceanify-example/0.0.1/stylesheets')
    var entries = yield glob(path.join(dir, 'app-*.css'))
    entries = entries.map(function(entry) {
      return path.relative(dir, entry).replace(/-[0-9a-f]{32}\.css$/, '.css')
    })

    expect(entries.length).to.equal(1)
    expect(entries).to.contain('app.css')

    // reset source
    yield writeFile(fpath, source)
  })

  it('should precompile dependencies', function* () {
    yield requestPath('/yen/1.2.4/index.js')
    yield sleep(2)

    var fpath = path.join(__dirname, 'example/public/yen/1.2.4/index.js')
    expect(yield exists(fpath)).to.be(true)
  })

  it('should not precompile if not main', function* () {
    var fpath = path.join(__dirname, 'example/public/yen/1.2.4/index.js')
    var stats = yield lstat(fpath)

    yield requestPath('/yen/1.2.4/events.js')
    yield sleep(2)
    expect((yield lstat(fpath)).mtime).to.eql(stats.mtime)
  })

  it('should not precompile if compiled already', function* () {
    var fpath = path.join(__dirname, 'example/public/yen/1.2.4/index.js')
    var stats = yield lstat(fpath)

    yield requestPath('/yen/1.2.4/index.js')
    yield sleep(2)
    expect((yield lstat(fpath)).mtime).to.eql(stats.mtime)
  })
})
