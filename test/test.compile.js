'use strict';

var Promise = require('bluebird')
var path = require('path')
var expect = require('expect.js')
var fs = Promise.promisifyAll(require('fs'))

var compile = require('..').compile

var base = path.resolve(__dirname, '../node_modules/@ali/belt')
var dest = path.resolve(__dirname, '../tmp')

var pkg


describe('compile', function() {
  before(function(done) {
    fs.readFileAsync(path.join(base, 'package.json'), 'utf-8')
      .then(function(content) {
        pkg = JSON.parse(content)
        var id = '@ali/belt/' + pkg.version + '/index.js'
        var fpath = path.join(base, 'index.js')

        return compile({ base: base, id: id, fpath: fpath, dest: dest })
      })
      .nodeify(done)
  })

  it('should insert version into the id of the compiled module', function(done) {
    fs.readFileAsync(path.join(dest, '@ali/belt/' + pkg.version + '/index.js'), 'utf-8')
      .then(function(content) {
        expect(content).to.contain('@ali/belt/' + pkg.version + '/index')
      })
      .nodeify(done)
  })
})
