'use strict'

const path = require('path')
const expect = require('expect.js')
const { exists } = require('mz/fs')
const exec = require('child_process').execSync
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({ root, entries: ['home.js'] })

describe('Package', function () {
  before(async function() {
    exec('rm -rf ' + path.join(root, 'public'))
    await porter.ready
  })

  it('should compile with package.compile(...entries)', async function () {
    const name = 'yen'
    const pkg = porter.package.find({ name })
    const { version, main } = pkg
    await pkg.compile(main)
    const fpath = path.join(root, 'public', name, version, main)

    expect(await exists(fpath)).to.be.ok()
  })
})
