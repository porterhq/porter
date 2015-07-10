'use strict'

/* eslint-disable no-eval */
function hasGenerator() {
  try {
    eval('(function*(){})()')
    return true
  } catch (err) {
    return false
  }
}
/* eslint-enable no-eval */


if (!hasGenerator()) {
  return
}

var request = require('supertest')
var expect = require('expect.js')

var oceanify = require('../g')
var app = require('./example/app')


describe('oceanify/g', function() {
  it('should handle components', function(done) {
    request(app.listen())
      .get('/ma/nga.js')
      .expect(200)
      .end(done)
  })

  it('should have got all the static methods', function() {
    expect(oceanify.parseAlias).to.be.a('function')
    expect(oceanify.compileAll).to.be.a('function')
  })
})
