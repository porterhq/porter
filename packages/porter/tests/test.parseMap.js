'use strict'

const path = require('path')
const expect = require('expect.js')

const parseMap = require('../lib/parseMap')
const root = path.join(__dirname, '../../porter-app')

describe('.parseMap', function() {
  let map

  before(async function () {
    map = await parseMap({
      root,
      paths: ['components', 'browser_modules']
    })
  })

  it('parse into recursive dependencies map by traversing components', function () {
    expect(map).to.be.an(Object)
    expect(map['@cara/porter-app'].dependencies.yen.version).to.equal('1.2.4')
  })

  it('handles components alias', function() {
    expect(map['@cara/porter-app'].alias['./lib']).to.equal('./lib/index')
  })

  it('handles node_modules alias too', function() {
    expect(map['@cara/porter-app'].dependencies.inferno.alias).to.eql({
      './dist': './dist/index'
    })
  })
})
