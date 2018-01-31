'use strict'

const expect = require('expect.js')

describe('cyclic modules', function() {
  it('require node_modules that has cyclic dependencies', function() {
    const Color = require('react-color')
    expect(Color.SwatchesPicker).to.be.ok()
  })
})
