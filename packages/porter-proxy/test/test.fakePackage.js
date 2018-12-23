'use strict'

const expect = require('expect.js')
const request = require('supertest')
const porter = require('../../porter-app/lib/porter-default')
let proxyApp

function requestPath(urlPath, status = 200, listener = proxyApp.callback()) {
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

describe('FakePackage', function() {
  before(async function() {
    const factory = require('../proxy-app')
    proxyApp = await factory()
  })

  it('should intercept local modules', async function() {
    const { name, version } = porter.package
    const res = await requestPath(`/${name}/${version}/shelter.js?main`)
    expect(res.text).to.contain(`define("${name}/${version}/shelter.js"`)
    // the original app is delegated as remote resource and shall not be bundled here
    expect(res.text).to.not.contain(`define("${name}/${version}/i18n/zh.js"`)
  })
})
