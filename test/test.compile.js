'use strict'

var Promise = require('native-or-bluebird')
var path = require('path')
var expect = require('expect.js')
var fs = require('fs')

var compile = require('..').compile

var base = path.resolve(__dirname, '../node_modules/heredoc')
var dest = path.resolve(__dirname, '../tmp')

var pkg


function readFileAsync(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(err)
      else resolve(content)
    })
  })
}


describe('compile', function() {
  before(function(done) {
    readFileAsync(path.join(base, 'package.json'), 'utf-8')
      .then(function(content) {
        pkg = JSON.parse(content)
        var id = 'heredoc/' + pkg.version + '/index.js'
        var fpath = path.join(base, 'index.js')

        return compile({ base: base, id: id, fpath: fpath, dest: dest })
      })
      .then(done, done)
  })

  it('should insert version into the id of the compiled module', function(done) {
    readFileAsync(path.join(dest, 'heredoc/' + pkg.version + '/index.js'), 'utf-8')
      .then(function(content) {
        expect(content).to.contain('heredoc/' + pkg.version + '/index')
      })
      .then(done, done)
  })
})
