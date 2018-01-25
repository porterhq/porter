'use strict'

const path = require('path')
const exec = require('child_process').execSync
const exists = require('fs').existsSync
const expect = require('expect.js')

const compileStyleSheets = require('../lib/compileStyleSheets')

const root = path.join(__dirname, '../../porter-app')
const pkg = require(`${root}/package.json`)

describe('.compileStyleSheets', function() {
  before(function () {
    exec('rm -rf ' + path.join(root, 'public'))
  })

  it('compiles stylesheets', async function () {
    await compileStyleSheets({
      root,
      match: 'stylesheets/app.css'
    })

    expect(exists(path.join(root, `public/${pkg.name}/${pkg.version}/stylesheets/app.css`)))
      .to.be(true)
  })
})
