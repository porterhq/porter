'use strict'

require('co-mocha')
var path = require('path')
var expect = require('expect.js')
var fs = require('fs')
var exec = require('child_process').execSync

var compileComponent = require('..').compileComponent

var exists = fs.existsSync


describe('compileComponent', function() {
  it('should compile component', function* () {
    var base = path.join(__dirname, 'example/components')
    var dest = path.join(__dirname, 'example/public')

    yield compileComponent({ base: base, id: 'ma/nga', dest: dest })
    expect(exists(path.join(dest, 'ma/nga.js'))).to.be(true)
  })

  after(function() {
    exec('rm -rf ' + path.join(__dirname, 'example', 'public'))
  })
})
