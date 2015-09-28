'use strict'

require('co-mocha')
var request = require('supertest')
var matchRequire = require('match-require')
var expect = require('expect.js')

var app = require('./example-fe/app')


function requestPath(apath) {
  return new Promise(function(resolve, reject) {
    request(app.callback())
      .get(apath)
      .expect(200)
      .end(function(err, res) {
        if (err) reject(err)
        else resolve(res)
      })
  })
}


describe('oceanify self', function() {
  it('should serve self', function* () {
    yield requestPath('/oceanify-example-fe/0.0.1/index.js')
  })

  it('should transform relative requires into absolute ones', function* () {
    var res = yield requestPath('/runner.js')
    var requires = matchRequire.findAll(res.text)

    expect(requires).to.contain('oceanify-example-fe/index')
    expect(requires).to.not.contain('../index')
  })
})
