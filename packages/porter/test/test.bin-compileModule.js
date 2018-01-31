'use strict'

const _spawn = require('child_process').spawn
const path = require('path')
const expect = require('expect.js')
const { exists } = require('mz/fs')


function spawn(command, args, opts) {
  return new Promise(function(resolve, reject) {
    var proc = _spawn(command, args, opts)

    proc.on('exit', function(code) {
      if (code === 0) resolve()
      else reject()
    })
  })
}

const root = path.join(__dirname, '../../porter-app')
const cmd = path.join(__dirname, '../bin/compileModule.js')

describe('bin/compileModule.js', function() {
  before(async function () {
    await spawn('rm', ['-rf', path.join(root, 'public')])
  })

  it('compiles module', async function () {
    await spawn(process.argv[0], [
      cmd,
      '--id', 'yen/1.2.4/index',
      '--root', root,
      '--paths', path.join(root, 'node_modules'),
      '--dest', path.join(root, 'public')
    ])

    expect(await exists(path.join(root, 'public/yen/1.2.4/index.js'))).to.be(true)
  })
})
