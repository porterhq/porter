'use strict'

const path = require('path')
const expect = require('expect.js')
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
    expect(lock[pkg.name][pkg.version].dependencies).to.eql({
      yen: '1.2.4',
      'chart.js': '2.7.0',
      jquery: '3.3.1',
      cropper: '3.1.4',
      prismjs: '1.11.0',
      'react-datepicker': '1.1.0',
      'expect.js': '0.3.1',
      'react-stack-grid': '0.7.1',
      inferno: '3.10.1',
      'react-color': '2.13.8',
      react: '16.2.0'
    })
  })
})
