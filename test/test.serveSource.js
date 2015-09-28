'use strict'

require('co-mocha')
var request = require('supertest')



function requestPath(apath) {
  return new Promise(function(resolve, reject) {
    var app = require('./example/app')

    request(app.callback())
      .get(apath)
      .expect(200)
      .end(function(err, res) {
        if (err) reject(err)
        else resolve(res)
      })
  })
}


describe('oceanify serveSource', function() {
  it('should serve import.js', function* () {
    yield requestPath('/import.js')
  })

  it('should serve components source', function* () {
    yield requestPath('/components/main.js')
  })

  it('should serve dependencies source', function* () {
    yield requestPath('/node_modules/yen/index.js')
  })

  it('should not serve source by default', function(done) {
    var app = require('./example/app-default')

    request(app.callback())
      .get('/components/main.js')
      .expect(404)
      .end(done)
  })
})
