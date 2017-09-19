'use strict'

require('co-mocha')
const path = require('path')
const expect = require('expect.js')
const exec = require('child_process').execSync

const { compileAll } = require('..')
const glob = require('../lib/glob')

const root = path.join(__dirname, '../examples/default')


describe('oceanify.compileAll', function() {
  beforeEach(function () {
    process.chdir(root)
    exec('rm -rf ' + path.join(root, 'public'))
  })

  it('should compile all components and their dependencies', function* () {
    yield compileAll({
      dest: 'public',
      match: 'home.js',
      paths: 'components',
      root: root,
      sourceOptions: { root: '/' }
    })

    const entries = yield glob('public/**/*.{js,map}', { cwd: root })

    expect(entries).to.contain('public/oceanify-example/0.0.1/home.js')
    expect(entries).to.contain('public/oceanify-example/0.0.1/home.js.map')

    expect(entries).to.contain('public/yen/1.2.4/index.js')
    expect(entries).to.contain('public/yen/1.2.4/index.js.map')

    expect(entries).to.contain('public/chart.js/2.7.0/src/chart.js')
    expect(entries).to.contain('public/chart.js/2.7.0/src/chart.js.map')
  })

  it('should compile components in muitiple paths', function* () {
    yield compileAll({
      dest: 'public',
      match: 'v2/home.js',
      paths: ['components', 'browser_modules'],
      root: root,
      sourceOptions: { root: '/' }
    })

    const entries = yield glob('public/**/*.{js,map}', { cwd: root })

    expect(entries).to.contain('public/oceanify-example/0.0.1/v2/home.js')
    expect(entries).to.contain('public/oceanify-example/0.0.1/v2/home.js.map')
  })
})
