'use strict'

const path = require('path')
const expect = require('expect.js')
const heredoc = require('heredoc').strip
const exec = require('child_process').execSync

const { compileComponent, parseMap } = require('..')
const { readFileSync: readFile } = require('mz/fs')


describe('.compileComponent', function () {
  const root = path.join(__dirname, '../examples/default')
  const dest = path.join(root, 'public')

  beforeEach(function () {
    exec('rm -rf ' + path.join(root, 'public'))
  })

  it('should compile component', async function () {
    await compileComponent('lib/foo', { root, dest })
    const fpath = path.join(dest, 'porter-app/0.0.1/lib/foo.js')
    const content = readFile(fpath, 'utf8')
    expect(content).to.contain('define("porter-app/0.0.1/lib/foo",')
    expect(content).to.not.contain('porter.config(')
  })

  it('should compile shadow component', async function () {
    const dependenciesMap = await parseMap({ root })

    await compileComponent('shadow/9527', {
      root, dest,
      dependencies: ['yen'],
      factory: heredoc(function() {/*
        'use strict'
        var $ = require('yen')
        console.log($)
      */}),
      dependenciesMap,
      includeModules: true
    })

    const content = readFile(path.join(dest, 'porter-app/0.0.1/shadow/9527.js'), 'utf8')
    expect(content).to.contain('shadow/9527')
    expect(content).to.contain('yen/1.2.4/index')
    expect(content).to.contain('yen/1.2.4/events')
  })

  it('can includeLoader', async function () {
    const paths = ['components', 'browser_modules']
    const dependenciesMap = await parseMap({ root, paths })

    await compileComponent('v2/home', {
      root, paths, dest,
      dependenciesMap,
      includeLoader: true
    })

    const content = readFile(path.join(dest, 'porter-app/0.0.1/v2/home.js'), 'utf8')
    expect(content).to.contain('define("porter-app/0.0.1/v2/home",')
    expect(content).to.contain('porter.config(')
  })
})
