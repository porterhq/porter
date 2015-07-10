'use strict'

var path = require('path')
var expect = require('expect.js')
var fs = require('fs')

var compile = require('..').compile
var parse = require('../lib/parse')

var base = path.join(__dirname, 'example/components')
var dest = path.join(__dirname, 'example/public')


var exists = fs.existsSync
var readFile = fs.readFileSync


describe('compile', function() {
  var fpath = path.join(base, 'ma/nga.js')

  before(function(done) {
    compile({ base: base, fpath: fpath, dest: dest })
      .then(function() {
        done()
      })
      .catch(done)
  })

  it('should generate the alias component', function() {
    var meta = parse(readFile(fpath, 'utf-8'))
    expect(exists(path.join(dest, 'ma/nga.js'))).to.be(true)
    expect(exists(path.join(dest, 'ma/nga-' + meta.digest.slice(0, 8) + '.js'))).to.be(true)
  })
})
