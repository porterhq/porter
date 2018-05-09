'use strict'

const path = require('path')
const expect = require('expect.js')
const semver = require('semver')
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({
  root,
  paths: ['components', 'browser_modules'],
  entries: ['home.js', 'test/suite.js']
})

describe('porter.package', function() {
  beforeEach(async function() {
    try {
      await porter.ready
    } catch (err) {
      console.error(err.stack)
    }
  })

  it('parse into recursive dependencies map by traversing components', function() {
    expect(porter.package.name).to.be('@cara/porter-app')
    expect(porter.package.dependencies.yen.version).to.equal('1.2.4')
  })

  it('parse require directory in components', function() {
    expect(porter.package.alias).to.eql({
      'i18n': 'i18n/index.js',
      'require-directory/convert/': 'require-directory/convert/index.js',
      'require-directory/math': 'require-directory/math/index.js'
    })
  })

  it('parse require directory in node_modules', function() {
    expect(porter.package.dependencies.inferno.alias).to.eql({
      'dist': 'dist/index.js'
    })

    expect(porter.package.dependencies['react-datepicker'].alias).to.eql({
      'lib': 'lib/index.js'
    })
  })

  it('parse require dir/ in node_modules', function() {
    expect(porter.package.dependencies['react-stack-grid'].alias).to.eql({
      'lib/animations/transitions/': 'lib/animations/transitions/index.js',
    })
  })
})

describe('porter.package.lock', function() {
  beforeEach(async function() {
    try {
      await porter.ready
    } catch (err) {
      console.error(err.stack)
    }
  })

  it('should flatten dependencies', function () {
    const pkg = require(path.join(root, 'package.json'))
    const { lock } = porter.package
    expect(lock).to.be.an(Object)
    const deps = lock[pkg.name][pkg.version].dependencies
    for (const name in deps) {
      expect(semver.satisfies(deps[name], pkg[name]))
    }
  })
})
