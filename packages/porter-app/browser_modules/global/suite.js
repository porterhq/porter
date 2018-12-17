'use strict'

const expect = require('expect.js')

describe('global', function() {
  it('should equal to window', function() {
    expect(global).to.equal(window)
  })

  it('should define process', function() {
    expect(process.browser).to.be.ok()
    expect(process.env).to.eql({
      BROWSER: true,
      NODE_ENV: process.env.NODE_ENV
    })
  })
})
