'use strict'

require('co-mocha')
var path = require('path')

var compileStyleSheets = require('../lib/compileStyleSheets')


describe('compileStyleSheets', function() {
  before(function() {
    process.chdir(path.join(__dirname, 'example'))
  })

  it('compiles stylesheets', function* () {
    yield* compileStyleSheets({
      match: 'stylesheets/app.css'
    })
  })
})
