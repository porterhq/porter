'use strict'

var expect = require('expect.js')
var path = require('path')

var parseAlias = require('../lib/parseAlias')


describe('parseAlias', function() {
  function hasAlias(actual, expected) {
    var parts = expected.split('/')
    var name = parts.shift()
    var main = parts.join('\\/')
    var regex = new RegExp('^' + name + '\\/[^\\/]+\\/' + main + '$')

    return regex.test(actual)
  }

  it('should parse dependenecies required in components', function() {
    var alias = parseAlias({
      cwd: path.join(__dirname, 'example')
    })

    expect(alias['ma/nga']).to.match(/ma\/nga-[0-9a-f]{8}/)
    expect(alias['ma/saka/edit']).to.match(/ma\/saka\/edit-[0-9a-f]{8}/)

    expect(hasAlias(alias.yen, 'yen/index')).to.be(true)
    expect(hasAlias(alias.heredoc, 'heredoc/index')).to.be(true)
    expect(hasAlias(alias.inherits, 'inherits/inherits_browser')).to.be(true)
    expect(hasAlias(alias['ez-editor'], 'ez-editor/index')).to.be(true)
    expect(hasAlias(alias.crox, 'crox/build/crox-all-min')).to.be(true)
    expect(hasAlias(alias['extend-object'], 'extend-object/extend-object')).to.be(true)
    expect(hasAlias(alias.jquery, 'jquery/dist/jquery')).to.be(true)
  })
})
