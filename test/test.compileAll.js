'use strict';

var Promise = require('bluebird')
var glob = Promise.promisify(require('glob'))
var fs = Promise.promisifyAll(require('fs'))
var path = require('path')
var expect = require('expect.js')

var compileAll = require('..').compileAll


describe('compileAll', function() {
  var versions = {}

  before(function(done) {
    var components = ['@ali/belt', '@ali/ink']

    var readVersions = Promise.all(components).map(function(component) {
      return fs.readFileAsync(path.join('node_modules', component, 'package.json'), 'utf-8')
        .then(JSON.parse)
        .then(function(pkg) {
          versions[pkg.name] = pkg.version
        })
    })

    Promise.all([
      readVersions,
      compileAll({ base: 'components', dest: 'tmp' }),
      compileAll({ base: 'node_modules', match: '@ali/{belt,ink}', dest: 'tmp' })
    ])
      .nodeify(done)
  })

  it('should compile all modules within specified dir', function(done) {
    Promise.all([
      glob('./components/**/*.js'),
      glob('./node_modules/@ali/{belt,ink}/**/*.js'),
      glob('./tmp/**/*.js')
    ])
      .then(function(results) {
        var components = results[0]
        var node_modules = results[1]
        var compiled = results[2]

        node_modules = node_modules.map(function(el) {
          return el.replace('./node_modules/', '').replace(/(@ali\/\w+)/, function(m, pkg) {
            return [pkg, versions[pkg]].join('/')
          })
        })

        for (var i = node_modules.length - 1; i >= 0; i--) {
          if (/(test|node_modules)/.test(node_modules[i]))
            node_modules.splice(i, 1)
        }

        components = components.map(function(el) {
          return el.replace('./components/', '')
        })

        compiled = compiled.map(function(el) {
          return el.replace('./tmp/', '')
        })

        expect(components.concat(node_modules).sort()).to.eql(compiled)
      })
      .nodeify(done)
  })
})
