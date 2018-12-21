'use strict'

const assert = require('assert').strict
const Koa = require('koa')
const request = require('supertest')
const porter = require('../lib/porter-preload')

const app = new Koa()
app.use(porter.async())

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
  it('should bundle all dependencies unless preloaded', async function() {
    const { name, version } = porter.package
    const res = await requestPath(`/${name}/${version}/home.js?main`)
    assert.ok(res.text.includes(`define("${name}/${version}/home.js"`))

    // jquery is bundled
    const jquery = porter.package.find({ name: 'jquery' })
    assert.ok(res.text.includes(`define("jquery/${jquery.version}/${jquery.main}`))

    // react is required by `preload.js` already, hence it should not be bundled here.
    const react = porter.package.find({ name: 'react' })
    assert.ok(!res.text.includes(`define("react/${react.version}/${react.main}`))
  })

  it("should bundle preload's dependencies", async function() {
    const { name, version } = porter.package
    const res = await requestPath(`/${name}/${version}/preload.js`)
    assert.ok(res.text.includes(`define("${name}/${version}/preload.js`))

    // yen is bundled
    const yen = porter.package.find({ name: 'yen' })
    assert.ok(res.text.includes(`define("yen/${yen.version}/${yen.main}`))
  })

  it('should be mutually exclusive', async function() {
    const { name, version } = porter.package
    const { text: mainText } = await requestPath(`/${name}/${version}/home.js?main`)
    const mainIds = mainText.match(/define\("([^"]+)"/g)
    const { text: preloadText } = await requestPath(`/${name}/${version}/preload.js`)
    const preloadIds = preloadText.match(/define\("([^"]+)"/g)

    for (const id of mainIds) assert.ok(!preloadIds.includes(id))
  })
})
