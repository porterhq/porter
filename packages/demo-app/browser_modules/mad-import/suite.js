'use strict'

const expect = require('expect.js')

/**
 * The loader of Porter use `importFactory()` to create an entry module to start the whole `require.async()` process. It is important to make sure every callback of `require.async()` is called eventually.
 */
describe('mad import', function() {
  it('should make sure every require.async() is executed', function(done) {
    this.timeout(1000)
    let count = 0
    let total = 10
    for (let i = 0; i < total; i++) {
      require.async('./foo', function(foo) {
        expect(foo).to.eql('foo')
        if (++count == total) done()
      })
    }
  })
})
