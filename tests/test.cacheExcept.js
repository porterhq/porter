'use strict'

require('co-mocha')
const path = require('path')
const request = require('supertest')
const expect = require('expect.js')
const { exists, unlink } = require('mz/fs')

const root = path.resolve(__dirname, '../examples/default')
const app = require(path.join(root, 'app.cacheExcept'))


function sleep(seconds) {
  return new Promise(function(resolve) {
    setTimeout(resolve, seconds * 1000)
  })
}

describe('opts.cacheExcept', function() {
  it('should skip compilation if within cache exceptions', function* () {
    const fpath = path.join(root, 'public/yen/1.2.4/index.js')

    try { yield unlink(fpath) } catch (e) {}
    yield new Promise(function(resolve, reject) {
      request(app.callback())
        .get('/yen/1.2.4/index.js')
        .expect(200)
        .end(function(err) {
          if (err) reject(err)
          else resolve()
        })
    })

    yield sleep(1)
    expect(yield exists(fpath)).to.be(false)
  })
})
