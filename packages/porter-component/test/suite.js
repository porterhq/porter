'use strict'

var $ = require('yen')
require('@cara/porter-component')
var expect = require('expect.js')

describe('yen.fn.reveal()', function() {
  before(function() {
    $('#fixture').addClass('hidden')
  })

  it('removeClass("hidden")', function() {
    expect($('#fixture').reveal().hasClass('hidden')).to.be(false)
  })
})
