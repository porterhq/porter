'use strict'

require('co-mocha')
const request = require('supertest')
const matchRequire = require('match-require')
const expect = require('expect.js')

const app = require('./example-fe/app')


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


describe('oceanify opts.serveSelf', function() {
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