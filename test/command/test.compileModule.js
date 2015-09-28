'use strict'

require('co-mocha')
var _spawn = require('child_process').spawn
var fs = require('fs')
var path = require('path')

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
  var root = path.join(__dirname, '../..')

  before(function* () {
    yield spawn('rm', [
      '-rf', path.join(root, 'test/example/public')
    ])
  })

  it('compiles module', function* () {
    yield spawn(path.join(root, 'bin/compileModule.js'), [
      '--id', 'yen/1.2.4/index',
      '--base', path.join('test/example/node_modules'),
      '--dets', path.join('test/example/public')
    ])

    exists(path.join(root, 'test/example/public/yen/1.2.4/index.js'))
  })
})
