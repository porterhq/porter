'use strict'

require('co-mocha')
var request = require('supertest')
var expect = require('expect.js')
var fs = require('fs')
var path = require('path')
var glob = require('glob')
var heredoc = require('heredoc').strip

var app = require('./example/app')


function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(err)
      else resolve(content)
    })
  })
}

function writeFile(fpath, content) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(fpath, content, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function globAsync(dir, opts) {
  return new Promise(function(resolve, reject) {
    glob(dir, opts || {}, function(err, entries) {
      if (err) reject(err)
      else resolve(entries)
    })
  })
}

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

function exists(fpath) {
  return new Promise(function(resolve) {
    fs.exists(fpath, resolve)
  })
}

function lstat(fpath) {
  return new Promise(function(resolve, reject) {
    fs.lstat(fpath, function(err, stats) {
      if (err) reject(err)
      else resolve(stats)
    })
  })
}


describe('oceanify', function() {
  it('should start from main', function* () {
    var res = yield requestPath('/main.js')
    expect(res.text).to.contain('\ndefine("main"')
    expect(res.text).to.contain('\noceanify["import"](["preload","main"])')
  })

  it('should handle components', function *() {
    yield requestPath('/ma/nga.js')
  })

  it('should handle dependencies', function* () {
    yield requestPath('/yen/1.2.4/index.js')
  })

  it('should handle rescursive dependencies', function* () {
    var fpath = path.join(__dirname, 'example/node_modules/ez-editor/node_modules/inherits/package.json')
    var pkg = JSON.parse(yield readFile(fpath, 'utf8'))
    var id = [
      pkg.name,
      pkg.version,
      pkg.browser.replace(/^\.\//, '')
    ].join('/')

    yield requestPath('/' + id)
  })

  it('should handle stylesheets', function* () {
    yield requestPath('/stylesheets/app.css')
  })

  it('should handle stylesheets in dependencies', function* () {
    yield requestPath('/ez-editor/assets/ez-editor.css')
  })

  it('should serve raw assets too', function* () {
    yield requestPath('/raw/logo.jpg')
  })
})


describe('oceanify Cache', function() {
  var root = path.join(__dirname, 'example')

  it('should cache generated style', function* () {
    yield requestPath('/stylesheets/app.css')

    var dir = path.join(root, 'public/stylesheets')
    var entries = yield globAsync(path.join(dir, 'app-*.css'))

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

    yield requestPath('/stylesheets/app.css')

    var dir = path.join(root, 'public/stylesheets')
    var entries = yield globAsync(path.join(dir, 'app-*.css'))
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
