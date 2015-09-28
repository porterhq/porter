'use strict'

require('co-mocha')
var path = require('path')
var expect = require('expect.js')
var exists = require('fs').existsSync
var exec = require('child_process').execSync

var compileModule = require('..').compileModule


describe('oceanify.compileModule', function () {
  before(function () {
    exec('rm -rf ' + path.join(__dirname, 'example', 'public'))
  })

  it('should compile specified module', function* () {
    var root = path.join(__dirname, 'example')
    var pkg = require('./example/node_modules/yen/package')
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
