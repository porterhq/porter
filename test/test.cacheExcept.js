'use strict'

require('co-mocha')
var path = require('path')
var request = require('supertest')
var expect = require('expect.js')
var fs = require('fs')

var app = require('./example/app-cache-except')


function exists(fpath) {
  return new Promise(function(resolve) {
    fs.exists(fpath, resolve)
  })
}

function sleep(seconds) {
  return new Promise(function(resolve) {
    setTimeout(resolve, seconds * 1000)
  })
}


describe('oceanify cacheExcept', function() {
  it('should skip compilation if within cache exceptions', function* () {
    yield new Promise(function(resolve, reject) {
      request(app.callback())
        .get('/ez-editor/0.2.4/index.js')
        .expect(200)
        .end(function(err) {
          if (err) reject(err)
          else resolve()
        })
    })

    yield sleep(1)

    var fpath = path.join(__dirname, 'example/public/ez-editor/0.2.4/index.js')
    expect(yield exists(fpath)).to.be(false)
  })
})
