'use strict'

const expect = require('expect.js')
require('react')

describe('conditional require', function() {
  it('should only require react.development', function() {
    const version = Object.keys(window.porter.modules.react)[0]
    expect(window.porter.registry['react/' + version + '/cjs/react.production.min']).to.be(undefined)
    expect(window.porter.registry['react/' + version + '/cjs/react.development']).to.be.ok()
  })
})
