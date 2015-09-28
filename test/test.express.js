'use strict'

var request = require('supertest')

var app = require('./example/app-express')


describe('oceanify/express', function() {
  it('should handle components', function(done) {
    request(app)
      .get('/ma/nga.js')
      .expect('Content-Type', /javascript/)
      .expect(200)
      .end(done)
  })

  it('should hand over if component or dependency not found', function(done) {
    request(app)
      .get('/404.js')
      .expect(404)
      .end(done)
  })
})
