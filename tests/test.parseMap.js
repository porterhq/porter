'use strict'

require('co-mocha')
const path = require('path')
const expect = require('expect.js')

const parseMap = require('../lib/parseMap')


describe('oceanify.parseMap', function() {
  it('parse into recursive dependencies map by traversing components', function* () {
    var map = yield parseMap({
      root: path.join(__dirname, '../examples/default')
    })

    expect(map).to.be.an(Object)
    expect(map.yen.version).to.equal('1.2.4')
  })
})
