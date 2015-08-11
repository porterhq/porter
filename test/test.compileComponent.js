'use strict'

var path = require('path')
var expect = require('expect.js')
var fs = require('fs')

var compileComponent = require('..').compileComponent

var base = path.join(__dirname, 'example/components')
var dest = path.join(__dirname, 'example/public')


var exists = fs.existsSync


describe('compileComponent', function() {
  before(function(done) {
    compileComponent({ base: base, id: 'ma/nga', dest: dest })
      .then(function() {
        done()
      })
      .catch(done)
  })

  it('should compile component', function() {
    expect(exists(path.join(dest, 'ma/nga.js'))).to.be(true)
  })
})
