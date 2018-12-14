'use strict'

const path = require('path')
const expect = require('expect.js')
const { readFile } = require('mz/fs')
const semver = require('semver')
const exec = require('child_process').execSync
const Porter = require('..')
const util = require('util')

const glob = util.promisify(require('glob'))

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({
  root,
  paths: ['components', 'browser_modules'],
  entries: ['home.js', 'test/suite.js', 'stylesheets/app.css']
})

describe('package.parseFile()', function() {
  before(async function() {
    await porter.ready
  })

  it('parse into recursive dependencies map by traversing components', function() {
    expect(porter.package.name).to.be('@cara/porter-app')
    expect(porter.package.dependencies.yen.version).to.equal('1.2.4')
  })

  it('parse require directory in components', function() {
    expect(porter.package.folder).to.eql({
      'i18n': true,
      'require-directory/math': true,
    })
  })

  it('parse require directory in node_modules', function() {
    expect(porter.package.dependencies.inferno.folder).to.eql({ 'dist': true })
    expect(porter.package.dependencies['react-datepicker'].folder).to.eql({ 'lib': true })
  })

  it('parse require dir/ in node_modules', function() {
    // no need to track specifiers like require('lib/animations/transitions/')
    // because loader.js has that kind of specifiers covered already.
    expect(porter.package.dependencies['react-stack-grid'].folder).to.eql({})
  })

  it('recognize css @import', function() {
    const cssFiles = Object.keys(porter.package.files).filter(file => file.endsWith('.css'))
    expect(cssFiles).to.eql([
      'stylesheets/app.css',
      'stylesheets/common/base.css',
      'stylesheets/common/reset.css'
    ])
  })
})

describe('package.find()', function() {
  before(async function() {
    await porter.ready
  })

  it('should find({ name, version })', function() {
    const name = 'yen'
    const version = '1.2.4'
    const pkg = porter.package.find({ name, version })
    expect(pkg.name).to.eql(name)
    expect(pkg.version).to.eql(version)
  })

  it('should find({ name })', function() {
    const pkg = porter.package.find({ name: 'react' })
    expect(pkg.name).to.eql('react')
  })
})

describe('package.findAll()', function() {
  before(async function() {
    await porter.ready
  })

  it('should findAll({ name })', function() {
    const packages = porter.package.findAll({ name: 'react' })
    expect(packages[0].name).to.eql('react')
  })
})

describe('package.lock', function() {
  before(async function() {
    await porter.ready
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

describe('package.compile()', function () {
  before(async function() {
    exec('rm -rf ' + path.join(root, 'public'))
    await porter.ready
  })

  it('should compile with package.compile(...entries)', async function () {
    const name = 'yen'
    const pkg = porter.package.find({ name })
    const { version, main } = pkg
    await pkg.compile(main)
    const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root })
    expect(entries).to.contain(`public/${name}/${version}/${main}`)
    expect(entries).to.contain(`public/${name}/${version}/${main}.map`)
  })

  it('should generate source map of modules as well', async function() {
    const name = 'react'
    const pkg = porter.package.find({ name })
    const { version, main } = pkg
    await pkg.compile(main)
    const fpath = path.join(root, 'public', `${name}/${version}/${main}.map`)
    const map = JSON.parse(await readFile(fpath, 'utf8'))
    expect(map.sources).to.contain('node_modules/react/index.js')
  })

  it('should compile package with different main entry', async function () {
    const name = 'chart.js'
    const pkg = porter.package.find({ name })
    const { version, main } = pkg
    await pkg.compile(main)
    const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root })
    expect(entries).to.contain(`public/${name}/${version}/${main}`)
    expect(entries).to.contain(`public/${name}/${version}/${main}.map`)
  })

  it('should compile entry with folder module', async function() {
    const name = 'react-datepicker'
    const pkg = porter.package.find({ name })
    const { version, main, folder } = pkg
    expect(folder[main]).to.be.ok()
    await pkg.compileAll()
    const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root })
    expect(entries).to.contain(`public/${name}/${version}/${main}/index.js`)
    expect(entries).to.contain(`public/${name}/${version}/${main}/index.js.map`)
  })

  it('should compile entry with browser field', async function() {
    const name = 'cropper'
    const pkg = porter.package.find({ name })
    const { version, main, dir } = pkg
    await pkg.compile(main)
    const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root })
    expect(entries).to.contain(`public/${name}/${version}/${main}`)
    expect(entries).to.contain(`public/${name}/${version}/${main}.map`)
    expect(require(`${dir}/package.json`).browser).to.eql(`${main}`)
  })
})
