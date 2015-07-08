'use strict'

var request = require('supertest')
var path = require('path')

var express = require('./example/express')
var oceanify = require('..')

var app = express()
app.use(oceanify({
  cwd: path.join(__dirname, 'example')
}))


describe('oceanify', function() {
  it('should handle components', function(done) {
    request(app)
      .get('/ma/nga.js')
      .expect('Content-Type', /javascript/)
      .expect(200)
      .end(done)
  })
})
