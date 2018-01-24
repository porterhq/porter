'use strict'

const matchRequire = require('match-require')

const reTemplateLiteral = /`[^`]+`/mg
const reAtImport = /@import/g

exports.findAll = function(content) {
  content = content
    .replace(reTemplateLiteral, '``')
    .replace(reAtImport, 'atImport')

  return matchRequire.findAll(content)
}
