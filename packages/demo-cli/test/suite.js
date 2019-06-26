'use strict'

const expect = require('expect.js')

describe('demo-cli', function() {
  it('should be able to load prismjs', function() {
    expect(typeof require('prismjs').highlightAll).to.eql('function')
  })
})
