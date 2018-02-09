'use strict'

const expect = require('expect.js')

describe('missing dep', function() {
  it('should still be accessible if requires missing dependency', function() {
    expect(require('./foo')).to.eql({})
  })
})
