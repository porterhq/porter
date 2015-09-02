'use strict'

require('co-mocha')
var path = require('path')
var expect = require('expect.js')
var exists = require('fs').existsSync
var exec = require('child_process').execSync

var compileModule = require('..').compileModule


describe('compileModule', function () {
  it('should compile specified module', function* () {
    var cwd = path.join(__dirname, 'example')
    var pkg = require('./example/node_modules/yen/package')
    var main = (pkg.main || 'index').replace(/\.js$/, '')

    yield compileModule({
      base: path.join(cwd, 'node_modules'),
      dest: path.join(cwd, 'public'),
      name: pkg.name,
      version: pkg.version,
      main: main
    })

    var fpath = path.join(cwd, 'public', pkg.name, pkg.version, main + '.js')
    expect(exists(fpath)).to.be(true)
  })

  after(function() {
    exec('rm -rf ' + path.join(__dirname, 'example', 'public'))
  })
})
