'use strict'

const path = require('path')
const expect = require('expect.js')
const heredoc = require('heredoc').strip
const { readFile } = require('mz/fs')
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({ root })

describe('.compileEntry(entry, { factory })', function () {
  before(async function() {
    await porter.compileEntry('fake/entry', {
      factory: heredoc(function() {/*
        'use strict'
        var $ = require('yen')
        $('body').addClass('hidden')
      */}),

    })
  })

  it('can compile component with specified factory', async function () {
    const { name, version } = porter.package
    const fpath = path.join(root, `public/${name}/${version}/fake/entry.js`)
    const content = await readFile(fpath, 'utf8')
    expect(content).to.contain('fake/entry.js')
    expect(content).to.contain('yen/1.2.4/index.js')
    expect(content).to.contain('yen/1.2.4/events.js')
  })
})

describe('.compileEntry(entry, { dependencies, factory })', function() {
  before(async function() {
    await porter.compileEntry('fake/entry', {
      dependencies: ['yen', 'jquery'],
      factory: heredoc(function() {/*
        'use strict'
        var $ = require('yen')
        $('body').addClass('hidden')
      */}),
      includeModules: true
    })
  })

  it('can compile component with specified dependencies and factory', async function() {
    const { name, version } = porter.package
    const fpath = path.join(root, `public/${name}/${version}/fake/entry.js`)
    const content = await readFile(fpath, 'utf8')
    const name = 'jquery'
    const { version, main } = porter.findMap({ name })
    expect(content).to.contain(`${name}/${version}/${main}`)
  })
})

describe('.compileEntry(entry, { includeLoader })', function() {
  it('can includeLoader', async function () {
    await porter.compileEntry('home', {
      includeLoader: true
    })
    const content = await readFile(path.join(root, 'public/home.js'), 'utf8')
    expect(content).to.contain(`define("${system.name}/${system.version}/home",`)
    expect(content).to.contain('porter.config(')
  })
})

// The way HTML creations were compiled.
describe('.compileEntry(entry, { dependencies, factory, includeLoader, loaderConfig })', function() {
  let content

  before(async function() {
    await porter.parsePromise
    const system = porter.system
    const dir = path.join(porter.dest, `${system.name}/${system.version}`)

    await porter.compileEntry('fake/entry', {
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
