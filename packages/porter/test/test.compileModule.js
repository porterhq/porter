'use strict'

const path = require('path')
const expect = require('expect.js')
const { exists } = require('mz/fs')
const exec = require('child_process').execSync
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({ root })


describe('.compileModule()', function () {
  before(async function() {
    exec('rm -rf ' + path.join(root, 'public'))
    // `porter.findMap()` won't be available unless `porter.parsePromise` is resolved.
    await porter.parsePromise
  })

  it('should compile specified module', async function () {
    const name = 'yen'
    const { version, main, dir } = porter.findMap({ name })
    await porter.compileModule({ name, version, entry: main }, {
      root: porter.root, paths: dir
    })
    const fpath = path.join(root, 'public', name, version, `${main}.js`)

    expect(await exists(fpath)).to.be.ok()
  })
})
