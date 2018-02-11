'use strict'

const expect = require('expect.js')

describe('require uri', function() {
  it('require.async("//example.com/foo.js")', function() {
    require.async('//g.alicdn.com/alilog/mlog/aplus_v2.js', function() {
      expect(window.porter.registry['//g.alicdn.com/alilog/mlog/aplus_v2.js']).to.be.ok()
    })
  })

  it('require("//example.com/foo.js")', function() {
    require('https://a1.alicdn.com/assets/qrcode.js')
    expect(window.QRCode).to.be.a(Function)
  })
})
