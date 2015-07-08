'use strict'

var expect = require('expect.js')
var path = require('path')

var parseAlias = require('../lib/parseAlias')


describe('parseAlias', function() {
  it('should parse dependenecies required in components', function() {
    var alias = parseAlias({
      cwd: path.join(__dirname, 'example')
    })

    expect(alias).to.eql({
      'ma/nga': 'ma/nga-7e41e8e0',
      'ma/saka/edit': 'ma/saka/edit-e03a6fb1',
      yen: 'yen/1.2.3/index',
      heredoc: 'heredoc/1.3.1/index',
      'ez-editor': 'ez-editor/0.2.2/index',
      crox: 'crox/1.2.7/build/crox-all-min',
      'extend-object': 'extend-object/1.0.0/extend-object',
      jquery: 'jquery/1.11.3/dist/jquery'
    })
  })
})
