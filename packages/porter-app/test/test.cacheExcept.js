'use strict'

const path = require('path')
const request = require('supertest')
const expect = require('expect.js')
const { exists, unlink } = require('mz/fs')

const root = path.resolve(__dirname, '..')
const app = require('../app.cacheExcept')

function sleep(seconds) {
  return new Promise(function(resolve) {
    setTimeout(resolve, seconds * 1000)
  })
}

describe('opts.cacheExcept', function() {
  it('should skip compilation if within cache exceptions', async function () {
    const fpath = path.join(root, 'public/yen/1.2.4/index.js')

    try { await unlink(fpath) } catch (e) {}
    await new Promise(function(resolve, reject) {
      request(app.callback())
        .get('/yen/1.2.4/index.js')
        .expect(200)
        .end(function(err) {
          if (err) reject(err)
          else resolve()
        })
    })

    await sleep(1)
    expect(await exists(fpath)).to.be(false)
  })
})
