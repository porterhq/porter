'use strict'

var Promise = require('native-or-bluebird')
var glob = require('glob')
var fs = require('fs')
var path = require('path')
var expect = require('expect.js')

var compileAll = require('..').compileAll


function readFileAsync(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(err)
      else resolve(content)
    })
  })
}

function globAsync(pattern) {
  return new Promise(function(resolve, reject) {
    glob(pattern, function(err, entries) {
      if (err) reject(err)
      else resolve(entries)
    })
  })
}


describe('compileAll', function() {
  var cwd = path.join(__dirname, 'example')

  function readPackage(name) {
    return readFileAsync(path.join(cwd, 'node_modules', name, 'package.json'), 'utf-8')
      .then(JSON.parse)
  }

  it('should compile matched modules', function(done) {
    var modules = ['inherits', 'heredoc']

    compileAll({
      cwd: cwd,
      base: 'node_modules',
      match: '{' + modules.join(',') + '}'
    })
      .then(function() {
        return Promise.all([
          globAsync(path.join(cwd, 'public/**/*.js')),
          Promise.all(modules.map(readPackage))
        ])
      })
      .then(function(results) {
        var entries = results[0].map(function(entry) {
          return path.relative(path.join(cwd, 'public'), entry)
        })
        var packages = results[1]

        packages.forEach(function(pkg) {
          var id = path.join(pkg.name, pkg.version, pkg.main || 'index.js')
          expect(entries.indexOf(id) >= 0).to.be(true)
        })
        done()
      })
      .catch(done)
  })

  it('should compile all components and their depedencies', function(done) {
    compileAll({
      cwd: cwd,
      base: 'components'
    })
      .then(function() {
        return globAsync(path.join(cwd, 'public/**/*.js'))
      })
      .then(function(entries) {
        return entries.map(function(entry) {
          return path.relative(cwd, entry)
        })
      })
      .then(function(entries) {
        expect(entries.indexOf('public/ma/nga.js') >= 0).to.be(true)
        done()
      })
      .catch(done)
  })
})
