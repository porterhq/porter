'use strict'

const assert = require('assert').strict
const Koa = require('koa')
const request = require('supertest')
const porter = require('../lib/porter-isolate')

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
  it('should isolate package from entry bundle', async function() {
    const { name, version } = porter.package
    const { text: mainText } = await requestPath(`/${name}/${version}/home.js?main`)
    assert.ok(mainText.includes(`define("${name}/${version}/home.js"`))
    const react = porter.package.find({ name: 'react' })
    assert.ok(!mainText.includes(`define("react/${react.version}/${react.main}"`))
  })

  it('should isolate package from preload bundle', async function() {
    const { name, version } = porter.package
    const { text: preloadText } = await requestPath(`/${name}/${version}/preload.js`)
    assert.ok(preloadText.includes(`define("${name}/${version}/preload.js"`))
    const reactDom = porter.package.find({ name: 'react-dom' })
    assert.ok(!preloadText.includes(`define("react-dom/${reactDom.version}/${reactDom.main}"`))
  })

  it('should be mutually exclusive', async function() {
    const { name, version } = porter.package
    const { text: mainText } = await requestPath(`/${name}/${version}/home.js?main`)
    const { text: preloadText } = await requestPath(`/${name}/${version}/preload.js`)
    const reactDom = porter.package.find({ name: 'react-dom' })
    const { text: reactText } = await requestPath(`/react-dom/${reactDom.version}/${reactDom.bundleEntry}`)

    const rdefine = /define\("([^"]+)"/g
    const mainIds = mainText.match(rdefine)
    const preloadIds = preloadText.match(rdefine)
    const reactIds = reactText.match(rdefine)

    for (const id of mainIds) {
      assert.ok(!preloadIds.includes(id))
      assert.ok(!reactIds.includes(id))
    }

    for (const id of preloadIds) {
      assert.ok(!mainIds.includes(id))
      assert.ok(!reactIds.includes(id), `${id} shouldn't present in react bundle`)
    }
  })
})
