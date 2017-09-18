'use strict'

require('co-mocha')
const path = require('path')
const expect = require('expect.js')
const heredoc = require('heredoc').strip
const exec = require('child_process').execSync

const { compileComponent, parseMap } = require('..')
const { existsSync: exists, readFileSync: readFile } = require('mz/fs')


describe('oceanify.compileComponent', function() {
  const root = path.join(__dirname, '../examples/default')
  const dest = path.join(root, 'public')

  before(function () {
    exec('rm -rf ' + path.join(root, 'public'))
  })

  it('should compile component', function* () {
    yield compileComponent('lib/foo', { root: root, dest })
    expect(exists(path.join(dest, 'oceanify-example/0.0.1/lib/foo.js'))).to.be(true)
  })

  it('should compile shadow component', function* () {
    var map = yield* parseMap({ root: root })

    yield* compileComponent('shadow/9527', {
      root: root,
      dest: dest,
      dependencies: ['yen'],
      factory: heredoc(function() {/*
        'use strict'
        var $ = require('yen')
        console.log($)
      */}),
      dependenciesMap: map
    })

    var content = readFile(path.join(dest, 'oceanify-example/0.0.1/shadow/9527.js'), 'utf-8')

    expect(content).to.contain('shadow/9527')
    expect(content).to.contain('yen/1.2.4/index')
    expect(content).to.contain('yen/1.2.4/events')
  })
})
