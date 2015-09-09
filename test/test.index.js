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
    request(app.listen())
      .get(apath)
      .expect(200)
      .end(function(err) {
        if (err) reject(err)
        else resolve()
      })
  })
}


describe('oceanify', function() {
  it('should handle components', function(done) {
    request(app.listen())
      .get('/ma/nga.js')
      .expect('Content-Type', /javascript/)
      .expect('ETag', /^[a-f0-9]+$/)
      .expect(200)
      .end(done)
  })

  it('should handle stylesheets', function(done) {
    request(app.listen())
      .get('/stylesheets/app.css')
      .expect('Content-Type', /css/)
      .expect('ETag', /^[a-f0-9]+$/)
      .expect(200)
      .end(done)
  })

  it('should handle stylesheets in node_modules', function(done) {
    request(app.listen())
      .get('/ez-editor/assets/ez-editor.css')
      .expect('Content-Type', /css/)
      .expect('ETag', /^[a-f0-9]+$/)
      .expect(200)
      .end(done)
  })

  it('should cache generated style', function* () {
    yield requestPath('/stylesheets/app.css')

    var dir = path.join(__dirname, 'example/tmp/stylesheets')
    var entries = yield globAsync(path.join(dir, 'app-*.css'))

    entries = entries.map(function(entry) {
      return path.relative(dir, entry).replace(/-[0-9a-f]{32}\.css$/, '.css')
    })

    expect(entries.length).to.equal(1)
    expect(entries).to.contain('app.css')

    var fpath = path.join(__dirname, 'example/components/stylesheets/app.css')
    var source = yield readFile(fpath, 'utf-8')

    yield writeFile(fpath, source + heredoc(function() {/*
      div {
        padding: 0;
      }
    */}))

    entries = yield globAsync(path.join(dir, 'app-*.css'))
    entries = entries.map(function(entry) {
      return path.relative(dir, entry).replace(/-[0-9a-f]{32}\.css$/, '.css')
    })

    expect(entries.length).to.equal(1)
    expect(entries).to.contain('app.css')

    // reset source
    yield writeFile(fpath, source)
  })
})
