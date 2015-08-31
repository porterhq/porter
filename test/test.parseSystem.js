'use strict'

require('co-mocha')
var path = require('path')
var expect = require('expect.js')

var parseMap = require('../lib/parseMap')
var parseSystem = require('../lib/parseSystem')


describe('parseSystem', function() {
  it('flatten the dependencies map', function* () {
    var map = yield parseMap({
      cwd: path.join(__dirname, 'example')
    })
    var system = parseSystem(map)

    expect(system.modules).to.be.an(Object)
    expect(Object.keys(system.modules.yen)).to.eql(['1.2.4'])

    expect(system.dependencies).to.be.an(Object)
    expect(system.dependencies.yen).to.equal('1.2.4')
  })
})
