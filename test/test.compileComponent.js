'use strict'

require('co-mocha')
var path = require('path')
var expect = require('expect.js')
var fs = require('fs')
var heredoc = require('heredoc').strip
var exec = require('child_process').execSync

var compileComponent = require('..').compileComponent
var parseMap = require('..').parseMap

var exists = fs.existsSync
var readFile = fs.readFileSync


describe('oceanify.compileComponent', function() {
  var root = path.join(__dirname, 'example')
  var dest = path.join(root, 'public')


  before(function () {
    exec('rm -rf ' + path.join(__dirname, 'example', 'public'))
  })

  it('should compile component', function* () {
    yield compileComponent('ma/nga', { root: root, dest: dest })
    expect(exists(path.join(dest, 'oceanify-example/0.0.1/ma/nga.js'))).to.be(true)
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
