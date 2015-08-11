'use strict'

var path = require('path')
var expect = require('expect.js')
var exists = require('fs').existsSync

var compileModule = require('..').compileModule


describe('compileModule', function() {
  it('should compile specified module', function(done) {
    var cwd = path.join(__dirname, 'example')
    var pkg = require('./example/node_modules/yen/package')
    var main = (pkg.main || 'index').replace(/\.js$/, '')

    compileModule({
      base: path.join(cwd, 'node_modules'),
      dest: path.join(cwd, 'public'),
      name: pkg.name,
      version: pkg.version,
      main: main
    })
      .then(function() {
        var fpath = path.join(cwd, 'public', pkg.name, pkg.version, main + '.js')

        expect(exists(fpath)).to.be(true)
        done()
      })
      .catch(done)
  })
})
