'use strict'

const expect = require('expect.js')

describe('browser field', function() {
  it('should shim stream with readable stream', function() {
    expect(require('stream').Readable).to.be.a(Function)
  })

  it('should recognize relative requires without extension', function() {
    // can't reuqire('brotli') directly yet
    // - https://github.com/foliojs/brotli.js/issues/20
    expect(require('brotli/decompress')).to.a(Function)
  })

  it('shim stream with readable-stream', function() {
    expect(require('iconv-lite').encode).to.be.a(Function)
  })
})
