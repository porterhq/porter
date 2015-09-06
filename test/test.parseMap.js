'use strict'

require('co-mocha')
var path = require('path')
var expect = require('expect.js')

var parseMap = require('../lib/parseMap')


describe('parseMap', function() {
  it('parse frontend module', function* () {
    var map = yield parseMap({
      base: 'test',
      cwd: path.join(__dirname, 'example-fe'),
      self: true
    })

    expect(map).to.be.an(Object)
    expect(map['oceanify-example-fe']).to.be.an(Object)

    var deps = map['oceanify-example-fe'].dependencies
    expect(deps).to.be.an(Object)
    expect(deps.yen).to.be.an(Object)
    expect(deps.yen.version).to.equal('1.2.4')
  })

  it('parse application modules', function* () {
    var map = yield parseMap({
      cwd: path.join(__dirname, 'example')
    })

    expect(map).to.be.an(Object)
    expect(map.yen.version).to.equal('1.2.4')
  })
})
