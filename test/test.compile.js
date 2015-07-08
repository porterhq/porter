'use strict'

var Promise = require('native-or-bluebird')
var path = require('path')
var expect = require('expect.js')
var fs = require('fs')

var compile = require('..').compile

var base = path.join(__dirname, 'example/node_modules/heredoc')
var dest = path.join(__dirname, 'example/public')


function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(err)
      else resolve(content)
    })
  })
}


describe('compile', function() {
  var pkg

  before(function(done) {
    readFile(path.join(base, 'package.json'), 'utf-8')
      .then(JSON.parse)
      .then(function(data) {
        pkg = data
        var id = 'heredoc/' + pkg.version + '/index.js'
        var fpath = path.join(base, 'index.js')

        return compile({ base: base, id: id, fpath: fpath, dest: dest })
      })
      .then(function() {
        done()
      })
      .catch(done)
  })

  it('should insert version into the id of the compiled module', function(done) {
    readFile(path.join(dest, 'heredoc/' + pkg.version + '/index.js'), 'utf-8')
      .then(function(content) {
        expect(content).to.contain('heredoc/' + pkg.version + '/index')
      })
      .then(done, done)
  })
})
