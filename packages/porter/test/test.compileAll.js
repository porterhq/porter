'use strict'

const path = require('path')
const expect = require('expect.js')
const exec = require('child_process').execSync
const { readFile } = require('mz/fs')
const Porter = require('..')
const glob = require('../lib/glob')

const root = path.join(__dirname, '../../porter-app')

describe('.compileAll()', function() {
  const porter = new Porter({ root, paths: ['components', 'browser_modules'] })
  let entries
  let system

  before(async function() {
    exec('rm -rf ' + path.join(root, 'public'))
    await porter.compileAll({
      match: ['home.js', 'runner.js'],
      spareMatch: ['i18n/index.js']
    })
    entries = await glob('public/**/*.{js,map}', { cwd: root })
    system = porter.system
  })

  it('should compile all components', async function () {
    const fpath = path.join(root, `public/${system.name}/${system.version}/home.js`)
    const content = await readFile(fpath, 'utf8')
    expect(content).to.contain(`define("${system.name}/${system.version}/i18n/index",`)
    expect(content).to.contain('porter.config(')
  })

  it('should compile all dependencies separately by default', async function () {
    expect(entries).to.contain('public/yen/1.2.4/index.js')
    expect(entries).to.contain('public/yen/1.2.4/index.js.map')

    expect(entries).to.contain('public/chart.js/2.7.0/src/chart.js')
    expect(entries).to.contain('public/chart.js/2.7.0/src/chart.js.map')
  })

  it('should compile components in all paths', async function () {
    expect(entries).to.contain(`public/${system.name}/${system.version}/runner.js`)
    expect(entries).to.contain(`public/${system.name}/${system.version}/runner.js.map`)
  })

  it('should compile spare components if `spareMatch` is set', async function () {
    expect(entries).to.contain(`public/${system.name}/${system.version}/i18n/index.js`)
  })
})

describe('.compileAll({ sourceRoot })', function() {
  const porter = new Porter({ root })
  let system

  before(async function() {
    exec('rm -rf ' + path.join(root, 'public'))
    await porter.compileAll({ match: 'home.js', sourceRoot: 'http://localhost:3000/' })
    system = porter.system
  })

  it('should set sourceRoot in components source map', async function() {
    const fpath = path.join(root, `public/${system.name}/${system.version}/home.js.map`)
    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sourceRoot).to.equal('http://localhost:3000/')
  })

  it('should set sourceRoot in related dependencies too', async function() {
    const fpath = path.join(root, 'public/yen/1.2.4/index.js.map')
    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sourceRoot).to.equal('http://localhost:3000/')
  })
})
