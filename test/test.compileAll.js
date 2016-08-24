'use strict'

require('co-mocha')
var glob = require('glob').sync
var path = require('path')
var expect = require('expect.js')
var exec = require('child_process').execSync

var compileAll = require('..').compileAll


describe('oceanify.compileAll', function() {
  var root = path.join(__dirname, 'example')

  beforeEach(function () {
    exec('rm -rf ' + path.join(__dirname, 'example', 'public'))
  })

  it('should compile all components and their dependencies', function* () {
    yield compileAll({
      dest: 'public',
      match: 'main.js',
      paths: 'components',
      root: root,
      sourceOptions: { root: '/' }
    })

    var entries = glob(path.join(root, 'public/**/*.{js,map}')).map(function(entry) {
      return path.relative(root, entry)
    })

    expect(entries).to.contain('public/main.js')
    expect(entries).to.contain('public/main.js.map')

    expect(entries).to.contain('public/yen/1.2.4/index.js')
    expect(entries).to.contain('public/yen/1.2.4/index.js.map')

    expect(entries).to.contain('public/crox/1.3.1/build/crox-all.js')
    expect(entries).to.contain('public/crox/1.3.1/build/crox-all.js.map')
  })

  it('should compile components in muitiple paths', function* () {
    yield compileAll({
      dest: 'public',
      match: 'v2/main.js',
      paths: ['components', 'browser_modules'],
      root: root,
      sourceOptions: { root: '/' }
    })

    var entries = glob(path.join(root, 'public/**/*.{js,map}')).map(function(entry) {
      return path.relative(root, entry)
    })

    expect(entries).to.contain('public/v2/main.js')
    expect(entries).to.contain('public/v2/main.js.map')
  })
})
