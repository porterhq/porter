'use strict'

const path = require('path')
const expect = require('expect.js')
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({ root, paths: ['components', 'browser_modules'] })

describe('.tree', function() {
  beforeEach(async function() {
    await porter.parsePromise
    if (porter.parseError) console.error(porter.parseError.stack)
  })

  it('parse into recursive dependencies map by traversing components', function() {
    expect(porter.tree).to.be.an(Object)
    expect(porter.tree['@cara/porter-app'].dependencies.yen.version).to.equal('1.2.4')
  })

  it('parse require directory in components', function() {
    expect(porter.tree['@cara/porter-app'].alias['require-directory/math']).to.equal('require-directory/math/index')
  })

  it('parse require directory in node_modules', function() {
    expect(porter.tree['@cara/porter-app'].dependencies.inferno.alias).to.eql({
      'dist': 'dist/index'
    })

    expect(porter.tree['@cara/porter-app'].dependencies['react-datepicker'].alias).to.eql({
      lib: 'lib/index'
    })
  })

  it('parse require dir/ in node_modules', function() {
    expect(porter.tree['@cara/porter-app'].dependencies['react-stack-grid'].alias).to.eql({
      'lib/animations/transitions/': 'lib/animations/transitions/index',
    })
  })
})

describe('.system', function() {
  it('should be the flat version of dependencies map', function () {
    const pkg = require(path.join(root, 'package.json'))
    const { system } = porter

    expect(system.modules).to.be.an(Object)
    expect(Object.keys(system.modules.yen)).to.eql(['1.2.4'])

    expect(system.name).to.equal(pkg.name)
    expect(system.version).to.equal(pkg.version)
    expect(system.main).to.equal(pkg.main || 'index')
  })
})
