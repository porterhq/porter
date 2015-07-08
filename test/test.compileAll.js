'use strict'

var glob = require('glob').sync
var fs = require('fs')
var path = require('path')
var expect = require('expect.js')

var compileAll = require('..').compileAll

var readFile = fs.readFileSync


describe('compileAll', function() {
  var cwd = path.join(__dirname, 'example')

  it('should compile matched modules', function(done) {
    var modules = ['inherits', 'heredoc']

    compileAll({
      cwd: cwd,
      base: 'node_modules',
      match: '{' + modules.join(',') + '}'
    })
      .then(function() {
        var entries = glob(path.join(cwd, 'public/**/*.js')).map(function(entry) {
          return path.relative(path.join(cwd, 'public'), entry)
        })
        var packages = modules.map(function(name) {
          return JSON.parse(readFile(path.join(cwd, 'node_modules', name, 'package.json'), 'utf-8'))
        })

        packages.forEach(function(pkg) {
          var id = path.join(pkg.name, pkg.version, pkg.main || 'index.js')
          expect(entries.indexOf(id) >= 0).to.be(true)
        })
        done()
      })
      .catch(done)
  })

  it('should compile all components and their dependencies', function(done) {
    compileAll({
      cwd: cwd,
      base: 'components'
    })
      .then(function() {
        var entries = glob(path.join(cwd, 'public/**/*.js')).map(function(entry) {
          return path.relative(cwd, entry)
        })

        expect(entries.indexOf('public/ma/nga.js') >= 0).to.be(true)
        done()
      })
      .catch(done)
  })
})
