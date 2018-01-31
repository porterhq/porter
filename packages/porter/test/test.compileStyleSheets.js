'use strict'

const path = require('path')
const exec = require('child_process').execSync
const { exists } = require('mz/fs')
const expect = require('expect.js')
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({ root })

describe('.compileStyleSheets', function() {
  before(async function () {
    exec('rm -rf ' + path.join(root, 'public'))
  })

  it('compiles stylesheets', async function () {
    await porter.compileStyleSheets({
      root,
      match: 'stylesheets/app.css'
    })

    const { name, version } = porter.system
    expect(await exists(path.join(root, `public/${name}/${version}/stylesheets/app.css`))).to.be.ok()
  })
})
