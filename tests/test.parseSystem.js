'use strict'

require('co-mocha')
var path = require('path')
var expect = require('expect.js')

var parseMap = require('../lib/parseMap')
var parseSystem = require('../lib/parseSystem')

const root = path.join(__dirname, '../examples/default')

describe('.parseSystem', function() {
  it('flatten the dependencies map', function* () {
    const map = yield parseMap({ root })
    const pkg = require(path.join(root, 'package.json'))
    const system = parseSystem(map)

    expect(system.modules).to.be.an(Object)
    expect(Object.keys(system.modules.yen)).to.eql(['1.2.4'])

    expect(system.name).to.equal(pkg.name)
    expect(system.version).to.equal(pkg.version)
    expect(system.main).to.equal(pkg.main || 'index')
  })
})
