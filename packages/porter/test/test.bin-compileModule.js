'use strict'

const _spawn = require('child_process').spawn
const path = require('path')
const expect = require('expect.js')
const { exists, readFile } = require('mz/fs')

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
    const pkgPath = `${root}/node_modules/yen`
    const { name, version } = require(`${pkgPath}/package.json`)

    await spawn(process.argv[0], [
      cmd,
      '--name', name,
      '--version', version,
      '--entry', 'index',
      '--root', root,
      '--paths', pkgPath,
      '--dest', path.join(root, 'public')
    ], { stdio: 'inherit' })

    const fpath = path.join(root, `public/${name}/${version}/index.js`)
    expect(await exists(fpath)).to.be(true)
    const content = await readFile(fpath, 'utf8')
    expect(content).to.contain(`define("${name}/${version}/index"`)
    expect(content).to.contain(`define("${name}/${version}/events"`)
  })
})
