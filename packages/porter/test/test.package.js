'use strict'

const path = require('path')
const expect = require('expect.js')
const { exists } = require('mz/fs')
const semver = require('semver')
const exec = require('child_process').execSync
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({ root, entries: ['home.js'] })

describe('package.parseFile()', function() {
  beforeEach(async function() {
    try {
      await porter.ready
    } catch (err) {
      console.error(err.stack)
    }
  })

  it('parse into recursive dependencies map by traversing components', function() {
    expect(porter.package.name).to.be('@cara/porter-app')
    expect(porter.package.dependencies.yen.version).to.equal('1.2.4')
  })

  it('parse require directory in components', function() {
    expect(porter.package.alias).to.eql({
      'i18n': 'i18n/index.js',
      'require-directory/convert/': 'require-directory/convert/index.js',
      'require-directory/math': 'require-directory/math/index.js'
    })
  })

  it('parse require directory in node_modules', function() {
    expect(porter.package.dependencies.inferno.alias).to.eql({
      'dist': 'dist/index.js'
    })

    expect(porter.package.dependencies['react-datepicker'].alias).to.eql({
      'lib': 'lib/index.js'
    })
  })

  it('parse require dir/ in node_modules', function() {
    expect(porter.package.dependencies['react-stack-grid'].alias).to.eql({
      'lib/animations/transitions/': 'lib/animations/transitions/index.js',
    })
  })
})

describe('package.lock', function() {
  beforeEach(async function() {
    try {
      await porter.ready
    } catch (err) {
      console.error(err.stack)
    }
  })

  it('should flatten dependencies', function () {
    const pkg = require(path.join(root, 'package.json'))
    const { lock } = porter.package
    expect(lock).to.be.an(Object)
    const deps = lock[pkg.name][pkg.version].dependencies
    for (const name in deps) {
      expect(semver.satisfies(deps[name], pkg[name]))
    }
  })
})

describe('package.compile()', function () {
  before(async function() {
    exec('rm -rf ' + path.join(root, 'public'))
    await porter.ready
  })

  it('should compile with package.compile(...entries)', async function () {
    const name = 'yen'
    const pkg = porter.package.find({ name })
    const { version, main } = pkg
    await pkg.compile(main)
    const fpath = path.join(root, 'public', name, version, main)

    expect(await exists(fpath)).to.be.ok()
  })
})
