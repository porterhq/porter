'use strict'

const expect = require('expect.js')
const fs = require('fs')
const markup = fs.readFileSync(__dirname + '/foo.html', 'utf8')

describe('brfs', function() {
  it('fs.readFileSync', function() {
    expect(markup.trim()).to.eql('<h1>It works!</h1>')
  })
})
