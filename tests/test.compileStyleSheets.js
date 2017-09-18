'use strict'

require('co-mocha')
const path = require('path')
const exec = require('child_process').execSync
const exists = require('fs').existsSync
const expect = require('expect.js')

const compileStyleSheets = require('../lib/compileStyleSheets')

const root = path.join(__dirname, '../examples/default')


describe('oceanify.compileStyleSheets', function() {
  before(function () {
    exec('rm -rf ' + path.join(root, 'public'))
  })

  it('compiles stylesheets', function* () {
    yield* compileStyleSheets({
      root,
      match: 'stylesheets/app.css'
    })

    expect(exists(path.join(root, 'public/oceanify-example/0.0.1/stylesheets/app.css')))
      .to.be(true)
  })
})
