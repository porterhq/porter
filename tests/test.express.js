'use strict'

var request = require('supertest')

var app = require('../examples/express/app')


describe('oceanify/express', function() {
  it('should handle components', function(done) {
    request(app)
      .get('/oceanify-express/0.0.1/show.js')
      .expect('Content-Type', /javascript/)
      .expect(200)
      .end(done)
  })

  it('should hand over if component or dependency not found', function(done) {
    request(app)
      .get('/non-existent.js')
      .expect(404)
      .end(done)
  })
})
