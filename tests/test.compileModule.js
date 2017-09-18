'use strict'

require('co-mocha')
const path = require('path')
const expect = require('expect.js')
const exists = require('fs').existsSync
const exec = require('child_process').execSync

const { compileModule } = require('..')
const root = path.join(__dirname, '../examples/default')


describe('oceanify.compileModule', function () {
  before(function () {
    exec('rm -rf ' + path.join(root, 'public'))
  })

  it('should compile specified module', function* () {
    var pkg = require(`${root}/node_modules/yen/package`)
    var main = (pkg.main || 'index').replace(/\.js$/, '')
    var id = path.join(pkg.name, pkg.version, main)

    yield* compileModule(id, {
      root: root,
      dest: 'public'
    })

    var fpath = path.join(root, 'public', id + '.js')
    expect(exists(fpath)).to.be(true)
  })
})
