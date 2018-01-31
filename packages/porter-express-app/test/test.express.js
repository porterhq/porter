'use strict'

const request = require('supertest')
const app = require('../app')

describe('opts.express', function() {
  it('should handle components', function(done) {
    request(app)
      .get('/@cara/porter-express-app/0.0.1/show.js')
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
