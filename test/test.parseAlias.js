'use strict'

var expect = require('expect.js')
var path = require('path')

var parseAlias = require('../lib/parseAlias')


describe('parseAlias', function() {
  it('should parse dependenecies required in components', function() {
    var alias = parseAlias({
      cwd: path.join(__dirname, 'example')
    })

    expect(alias['ma/nga']).to.match(/ma\/nga-[0-9a-f]{8}/)
    expect(alias['ma/saka/edit']).to.match(/ma\/saka\/edit-[0-9a-f]{8}/)

    expect(alias.yen).to.match(/yen\/\d+\.\d+\.\d+\/index/)
    expect(alias.heredoc).to.match(/heredoc\/\d+\.\d+\.\d+\/index/)
    expect(alias.inherits).to.match(/inherits\/\d+\.\d+\.\d+\/inherits_browser/)
    expect(alias['ez-editor']).to.match(/ez-editor\/\d+\.\d+\.\d+\/index/)
    expect(alias.crox).to.match(/crox\/\d+\.\d+\.\d+\/build\/crox-all-min/)
    expect(alias['extend-object']).to.match(/extend-object\/\d+\.\d+\.\d+\/extend-object/)
    expect(alias.jquery).to.match(/jquery\/\d+\.\d+\.\d+\/dist\/jquery/)
  })
})
