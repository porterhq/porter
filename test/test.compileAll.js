'use strict'

require('co-mocha')
var glob = require('glob').sync
var path = require('path')
var expect = require('expect.js')
var exec = require('child_process').execSync

var compileAll = require('..').compileAll


describe('compileAll', function() {
  var cwd = path.join(__dirname, 'example')

  it('should compile all components and their dependencies', function* () {
    yield compileAll({
      cwd: cwd,
      base: 'components'
    })

    var entries = glob(path.join(cwd, 'public/**/*.js')).map(function(entry) {
      return path.relative(cwd, entry)
    })

    expect(entries).to.contain('public/main.js')
    expect(entries).to.contain('public/yen/1.2.4/index.js')
    expect(entries).to.contain('public/crox/1.3.1/build/crox-all.js')
  })

  after(function () {
    exec('rm -rf ' + path.join(__dirname, 'example', 'public'))
  })
})
