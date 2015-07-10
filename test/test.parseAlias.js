'use strict'

var expect = require('expect.js')
var path = require('path')
var semver = require('semver')

var parseAlias = require('../lib/parseAlias')
var stripVersion = require('../lib/stripVersion')


describe('parseAlias', function() {
  function hasVersion(actual, expected) {
    if (/-[0-9a-f]{8}$/.test(actual)) {
      return true
    }

    var parts = actual.split('/')

    for (var i = 0, len = parts.length; i < len; i++) {
      if (semver.valid(parts[i])) {
        return true
      }
    }
  }

  it('should parse dependenecies required in components', function() {
    var alias = parseAlias({
      cwd: path.join(__dirname, 'example')
    })

    for (var name in alias) {
      expect(hasVersion(alias[name])).to.be(true)
      alias[name] = stripVersion(alias[name])
    }

    expect(alias).to.eql({
      'ma/nga': 'ma/nga',
      'ma/saka/edit': 'ma/saka/edit',
      yen: 'yen/index',
      heredoc: 'heredoc/index',
      inherits: 'inherits/inherits_browser',
      'ez-editor': 'ez-editor/index',
      crox: 'crox/build/crox-all-min',
      'extend-object': 'extend-object/extend-object',
      jquery: 'jquery/dist/jquery'
    })
  })
})
