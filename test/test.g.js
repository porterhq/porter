'use strict'

var request = require('supertest')

var app = require('./example/app')


describe('oceanify/g', function() {
  it('should handle components', function(done) {
    request(app.listen())
      .get('/ma/nga.js')
      .expect(200)
      .end(done)
  })
})
