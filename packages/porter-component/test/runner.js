'use strict'

var $ = require('yen')
require('@cara/porter-component')
var expect = require('expect.js')

mocha.setup('bdd')

describe('yen.fn.reveal()', function() {
  it('removeClass("hidden")', function() {
    var $el = $('#fixture').reveal()
    expect($el.hasClass('hidden')).to.be(false)
  })
})

mocha.run()
