'use strict'

require('co-mocha')
var _spawn = require('child_process').spawn
var fs = require('fs')
var path = require('path')
var expect = require('expect.js')

var exists = fs.existsSync


function spawn(command, args, opts) {
  return new Promise(function(resolve, reject) {
    var proc = _spawn(command, args, opts)

    proc.on('exit', function(code) {
      if (code === 0) resolve()
      else reject()
    })
  })
}


describe('bin/compileModule.js', function() {
  var root = path.join(__dirname, '../example')

  before(function* () {
    yield spawn('rm', [
      '-rf', path.join(root, 'public')
    ])
  })

  it('compiles module', function* () {
    yield spawn(process.argv[0], [
      '--harmony',
      path.join(root, '../../bin/compileModule.js'),
      '--id', 'yen/1.2.4/index',
      '--base', path.join(root, 'node_modules'),
      '--dest', path.join(root, 'public')
    ])

    expect(exists(path.join(root, 'public/yen/1.2.4/index.js'))).to.be(true)
  })
})
