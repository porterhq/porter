'use strict'

var request = require('supertest')

var app = require('./example/express')


describe('oceanify', function() {
  it('should handle components', function(done) {
    request(app)
      .get('/ma/nga.js')
      .expect('Content-Type', /javascript/)
      .expect(200)
      .end(done)
  })
})
