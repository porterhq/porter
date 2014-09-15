'use strict';

var Promise = require('bluebird')
var compileAll = require('..').compileAll
var glob = Promise.promisify(require('glob'))
var expect = require('expect.js')

describe('compileAll', function() {
  before(function(done) {
    Promise.all([
      compileAll({ base: 'components', dest: 'tmp' }),
      compileAll({ base: 'node_modules', families: '@ali/ink', dest: 'tmp' })
    ])
      .nodeify(done)
  })

  it('should compile all modules within specified dir', function(done) {
    Promise.all([
      glob('./components/**/*.js'),
      glob('./node_modules/@ali/ink/**/*.js'),
      glob('./tmp/**/*.js')
    ])
      .then(function(results) {
        var components = results[0]
        var node_modules = results[1]
        var compiled = results[2]

        for (var i = node_modules.length - 1; i >= 0; i--) {
          if (/@ali\/ink\/(test|node_modules)/.test(node_modules[i]))
            node_modules.splice(i, 1)
        }

        components = components.map(function(el) {
          return el.replace('./components/', '')
        })

        node_modules = node_modules.map(function(el) {
          return el.replace('./node_modules/', '')
        })

        compiled = compiled.map(function(el) {
          return el.replace('./tmp/', '')
        })

        expect(components.concat(node_modules).sort()).to.eql(compiled)
      })
      .nodeify(done)
  })
})
