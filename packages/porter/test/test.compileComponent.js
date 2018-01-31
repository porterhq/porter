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
  beforeEach(async function () {
    exec('rm -rf ' + path.join(porter.dest))
  })

  it('should compile component', async function () {
    await porter.compileComponent('i18n/index')
    const { system } = porter
    const dir = path.join(porter.dest, `${system.name}/${system.version}`)
    const fpath = path.join(dir, 'i18n/index.js')
    const content = await readFile(fpath, 'utf8')
    expect(content).to.contain(`define("${system.name}/${system.version}/i18n/index",`)
    expect(content).to.not.contain('porter.config(')
  })

  it('should compile shadow component', async function () {
    await porter.compileComponent('shadow/9527', {
      dependencies: ['yen'],
      factory: heredoc(function() {/*
        'use strict'
        var $ = require('yen')
        $('body').addClass('hidden')
      */}),
      includeModules: true
    })

    const { system } = porter
    const dir = path.join(porter.dest, `${system.name}/${system.version}`)
    const content = await readFile(path.join(dir, 'shadow/9527.js'), 'utf8')
    expect(content).to.contain('shadow/9527')
    expect(content).to.contain('yen/1.2.4/index')
    expect(content).to.contain('yen/1.2.4/events')
  })

  it('can includeLoader', async function () {
    await porter.compileComponent('home', {
      includeLoader: true
    })

    const { system } = porter
    const dir = path.join(porter.dest, `${system.name}/${system.version}`)
    const content = await readFile(path.join(dir, 'home.js'), 'utf8')
    expect(content).to.contain(`define("${system.name}/${system.version}/home",`)
    expect(content).to.contain('porter.config(')
  })
})
