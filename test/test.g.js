'use strict'

var app = require('../example')
var request = require('supertest')


describe('oceanify/g', function() {
  it('should handle components', function(done) {
    request(app.listen())
      .get('/ma/nga.js')
      .expect(200)
      .end(done)
  })
})
