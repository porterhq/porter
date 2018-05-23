'use strict'

import * as expect from 'expect.js'
import * as Prism from 'prismjs'

describe('porter-ts-demo', function() {
  it('should be able to import prismjs', function() {
    expect(Prism.highlightAll).to.be.a(Function)
  })
})
