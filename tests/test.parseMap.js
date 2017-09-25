'use strict'

require('co-mocha')
const path = require('path')
const expect = require('expect.js')

const parseMap = require('../lib/parseMap')


describe('oceanify.parseMap', function() {
  const root = path.join(__dirname, '../examples/default')
  let map

  before(function* () {
    map = yield parseMap({
      root,
      paths: ['components', 'browser_modules']
    })
  })

  it('parse into recursive dependencies map by traversing components', function () {
    expect(map).to.be.an(Object)
    expect(map['oceanify-example'].dependencies.yen.version).to.equal('1.2.4')
  })

  it('handles components alias', function() {
    expect(map['oceanify-example'].alias['lib']).to.equal('lib/index')
  })

  it('handles node_modules alias too', function() {
    expect(map['oceanify-example'].dependencies.inferno.alias).to.eql({
      './dist': './dist/index'
    })
  })
})
