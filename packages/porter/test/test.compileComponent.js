'use strict'

const path = require('path')
const expect = require('expect.js')
const heredoc = require('heredoc').strip
const exec = require('child_process').execSync
const { readFile } = require('mz/fs')
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({ root })


describe('.compileComponent()', function () {
  let system, dir

  before(async function() {
    await porter.parsePromise
    system = porter.system
    dir = path.join(porter.dest, `${system.name}/${system.version}`)
  })

  beforeEach(async function () {
    exec('rm -rf ' + path.join(porter.dest))
  })

  it('should compile component', async function () {
    await porter.compileComponent('i18n/index')
    const fpath = path.join(dir, 'i18n/index.js')
    const content = await readFile(fpath, 'utf8')
    expect(content).to.contain(`define("${system.name}/${system.version}/i18n/index",`)
    // include components by default
    expect(content).to.contain(`define("${system.name}/${system.version}/i18n/zh",`)
    expect(content).to.not.contain('porter.config(')
  })

  it('can compile specified component only, without bundling', async function() {
    await porter.compileComponent('i18n/index', {
      includeComponents: false
    })

    const fpath = path.join(dir, 'i18n/index.js')
    const content = await readFile(fpath, 'utf8')
    expect(content).to.contain(`define("${system.name}/${system.version}/i18n/index",`)
    expect(content).to.not.contain(`define("${system.name}/${system.version}/i18n/zh",`)
    expect(content).to.not.contain('porter.config(')
  })
})

describe('.compileComponent(entry, { factory })', function () {
  let system, dir

  before(async function() {
    await porter.parsePromise
    system = porter.system
    dir = path.join(porter.dest, `${system.name}/${system.version}`)
  })

  it('can compile component with specified factory', async function () {
    await porter.compileComponent('fake/entry', {
      factory: heredoc(function() {/*
        'use strict'
        var $ = require('yen')
        $('body').addClass('hidden')
      */}),
      includeModules: true
    })

    const content = await readFile(path.join(dir, 'fake/entry.js'), 'utf8')
    expect(content).to.contain('fake/entry')
    expect(content).to.contain('yen/1.2.4/index')
    expect(content).to.contain('yen/1.2.4/events')
  })
})

describe('.compileComponent(entry, { dependencies, factory })', function() {
  let system, dir

  before(async function() {
    await porter.parsePromise
    system = porter.system
    dir = path.join(porter.dest, `${system.name}/${system.version}`)
  })

  it('can compile component with specified dependencies and factory', async function() {
    await porter.compileComponent('fake/entry', {
      dependencies: ['yen', 'jquery'],
      factory: heredoc(function() {/*
        'use strict'
        var $ = require('yen')
        $('body').addClass('hidden')
      */}),
      includeModules: true
    })

    const content = await readFile(path.join(dir, 'fake/entry.js'), 'utf8')
    expect(content).to.contain('fake/entry')
    expect(content).to.contain('yen/1.2.4/index')
    expect(content).to.contain('yen/1.2.4/events')

    const name = 'jquery'
    const { version, main } = porter.findMap({ name })
    expect(content).to.contain(`${name}/${version}/${main}`)
  })
})

describe('.compileComponent(entry, { includeLoader })', function() {
  let system, dir

  before(async function() {
    await porter.parsePromise
    system = porter.system
    dir = path.join(porter.dest, `${system.name}/${system.version}`)
  })

  it('can includeLoader', async function () {
    await porter.compileComponent('home', {
      includeLoader: true
    })
    const content = await readFile(path.join(dir, 'home.js'), 'utf8')
    expect(content).to.contain(`define("${system.name}/${system.version}/home",`)
    expect(content).to.contain('porter.config(')
  })
})

// The way HTML creations were compiled.
describe('.compileComponent(entry, { dependencies, factory, includeLoader, loaderConfig })', function() {
  let content

  before(async function() {
    await porter.parsePromise
    const system = porter.system
    const dir = path.join(porter.dest, `${system.name}/${system.version}`)

    await porter.compileComponent('fake/entry', {
      dependencies: ['yen', 'jquery'],
      factory: heredoc(function() {/*
        'use strict'
        var $ = require('yen')
        $('body').removeClass('hidden')
      */}),
      includeLoader: true,
      includeModules: true,
      loaderConfig: { preload: 'yen' }
    })

    content = await readFile(path.join(dir, 'fake/entry.js'), 'utf8')
  })

  it('can override loaderConfig', async function() {
    expect(content).to.contain('preload:"yen"')
  })

  it('should only contain a branch of the whole dependencies tree', async function() {
    expect(content).to.not.contain('"react":')
  })
})
