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
      match: ['home.js', 'test/suite.js'],
      spareMatch: ['i18n/index.js']
    })
    entries = await glob('public/**/*.{js,map}', { cwd: root })
    system = porter.system
  })

  it('should compile components with internal dependencies bundled', async function () {
    const fpath = path.join(root, `public/${system.name}/${system.version}/home.js`)
    const content = await readFile(fpath, 'utf8')
    expect(content).to.contain(`define("${system.name}/${system.version}/i18n/index",`)
    expect(content).to.contain('porter.config(')
  })

  it('should compile modules separately', async function () {
    const name = 'chart.js'
    const { version, main } = porter.findMap({ name })
    expect(entries).to.contain(`public/${name}/${version}/${main}.js`)
    expect(entries).to.contain(`public/${name}/${version}/${main}.js.map`)
  })

  it('should compile modules that have directory as main', async function() {
    const name = 'react-datepicker'
    const { version, main, alias } = porter.findMap({ name })
    expect(entries).to.contain(`public/${name}/${version}/${alias[main]}.js`)
    expect(entries).to.contain(`public/${name}/${version}/${alias[main]}.js.map`)
  })

  it('should compile modules with browser field', async function() {
    const name = 'cropper'
    const { version, main, dir } = porter.findMap({ name })
    expect(entries).to.contain(`public/${name}/${version}/${main}.js`)
    expect(entries).to.contain(`public/${name}/${version}/${main}.js.map`)
    expect(require(`${dir}/package.json`).browser).to.eql(`${main}.js`)
  })

  it('should compile components in all paths', async function () {
    expect(entries).to.contain(`public/${system.name}/${system.version}/test/suite.js`)
    expect(entries).to.contain(`public/${system.name}/${system.version}/test/suite.js.map`)
  })

  it('should compile spare components if `spareMatch` is set', async function () {
    expect(entries).to.contain(`public/${system.name}/${system.version}/i18n/index.js`)
  })

  it('should generate source map of main components', async function() {
    const fpath = path.join(root, `public/${system.name}/${system.version}/home.js.map`)
    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('components/home.js')
    expect(map.sources).to.contain('components/i18n/index.js')
    expect(map.sources).to.contain('components/i18n/zh.js')
  })

  it('should generate source map of components from other paths', async function() {
    const fpath = path.join(root, `public/${system.name}/${system.version}/test/suite.js.map`)
    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('browser_modules/test/suite.js')
    expect(map.sources).to.contain('browser_modules/cyclic-modules/suite.js')
    expect(map.sources).to.contain('browser_modules/require-directory/convert/index.js')
  })

  it('should generate source map of modules as well', async function() {
    const name = 'react'
    const { version, main } = porter.findMap({ name })
    const fpath = path.join(root, 'public', `${name}/${version}/${main}.js.map`)
    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('node_modules/react/index.js')
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
