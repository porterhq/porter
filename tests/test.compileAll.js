'use strict'

require('co-mocha')
const path = require('path')
const expect = require('expect.js')
const exec = require('child_process').execSync
const { readFile } = require('mz/fs')

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
      match: 'home.js',
      paths: 'components',
      root,
      sourceOptions: { root: '/' }
    })

    const entries = yield glob('public/**/*.{js,map}', { cwd: root })

    expect(entries).to.contain('public/oceanify-example/0.0.1/home.js')
    expect(entries).to.contain('public/oceanify-example/0.0.1/home.js.map')

    const fpath = path.join(root, 'public/oceanify-example/0.0.1/home.js')
    const content = yield readFile(fpath, 'utf8')
    expect(content).to.contain('define("oceanify-example/0.0.1/lib/index",')
    expect(content).to.contain('oceanify.config(')

    expect(entries).to.contain('public/yen/1.2.4/index.js')
    expect(entries).to.contain('public/yen/1.2.4/index.js.map')

    expect(entries).to.contain('public/chart.js/2.7.0/src/chart.js')
    expect(entries).to.contain('public/chart.js/2.7.0/src/chart.js.map')
  })

  it('should compile components in muitiple paths', function* () {
    yield compileAll({
      match: 'v2/home.js',
      paths: ['components', 'browser_modules'],
      root,
      sourceOptions: { root: '/' }
    })

    const entries = yield glob('public/**/*.{js,map}', { cwd: root })

    expect(entries).to.contain('public/oceanify-example/0.0.1/v2/home.js')
    expect(entries).to.contain('public/oceanify-example/0.0.1/v2/home.js.map')
  })

  it('should compile spare components if spareMatch is set', function* () {
    yield compileAll({
      match: 'v2/home.js',
      spareMatch: 'templates/base.js',
      root,
      sourceOptions: { root: '/' }
    })

    const entries = yield glob('public/**/*.{js,map}', { cwd: root })
    expect(entries).to.contain('public/oceanify-example/0.0.1/templates/base.js')
  })
})
