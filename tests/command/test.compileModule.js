'use strict'

require('co-mocha')
const _spawn = require('child_process').spawn
const fs = require('fs')
const path = require('path')
const expect = require('expect.js')

const exists = fs.existsSync


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
  const root = path.join(__dirname, '../../examples/default')
  const cmd = path.resolve(__dirname, '../../bin/compileModule.js')

  before(function* () {
    yield spawn('rm', [
      '-rf', path.join(root, 'public')
    ])
  })

  it('compiles module', function* () {
    yield spawn(process.argv[0], [
      cmd,
      '--id', 'yen/1.2.4/index',
      '--root', root,
      '--paths', path.join(root, 'node_modules'),
      '--dest', path.join(root, 'public')
    ])

    expect(exists(path.join(root, 'public/yen/1.2.4/index.js'))).to.be(true)
  })
})
