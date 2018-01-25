'use strict'

const path = require('path')
const expect = require('expect.js')
const exec = require('child_process').execSync
const { readFile } = require('mz/fs')

const { compileAll } = require('..')
const glob = require('../lib/glob')

const root = path.join(__dirname, '../../porter-app')
const pkg = require(`${root}/package.json`)

describe('.compileAll', function() {
  beforeEach(function () {
    process.chdir(root)
    exec('rm -rf ' + path.join(root, 'public'))
  })

  it('should compile all components and their dependencies', async function () {
    await compileAll({
      match: 'home.js',
      paths: 'components',
      root,
      sourceOptions: { root: '/' }
    })

    const entries = await glob('public/**/*.{js,map}', { cwd: root })

    expect(entries).to.contain(`public/${pkg.name}/${pkg.version}/home.js`)
    expect(entries).to.contain(`public/${pkg.name}/${pkg.version}/home.js.map`)

    const fpath = path.join(root, `public/${pkg.name}/${pkg.version}/home.js`)
    const content = await readFile(fpath, 'utf8')
    expect(content).to.contain(`define("${pkg.name}/${pkg.version}/lib/index",`)
    expect(content).to.contain('porter.config(')

    expect(entries).to.contain('public/yen/1.2.4/index.js')
    expect(entries).to.contain('public/yen/1.2.4/index.js.map')

    expect(entries).to.contain('public/chart.js/2.7.0/src/chart.js')
    expect(entries).to.contain('public/chart.js/2.7.0/src/chart.js.map')
  })

  it('should compile components in muitiple paths', async function () {
    await compileAll({
      match: 'v2/home.js',
      paths: ['components', 'browser_modules'],
      root,
      sourceOptions: { root: '/' }
    })

    const entries = await glob('public/**/*.{js,map}', { cwd: root })

    expect(entries).to.contain(`public/${pkg.name}/${pkg.version}/v2/home.js`)
    expect(entries).to.contain(`public/${pkg.name}/${pkg.version}/v2/home.js.map`)
  })

  it('should compile spare components if spareMatch is set', async function () {
    await compileAll({
      match: 'v2/home.js',
      spareMatch: 'templates/base.js',
      root,
      sourceOptions: { root: '/' }
    })

    const entries = await glob('public/**/*.{js,map}', { cwd: root })
    expect(entries).to.contain(`public/${pkg.name}/${pkg.version}/templates/base.js`)
  })
})
