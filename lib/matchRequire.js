'use strict'

const matchRequire = require('match-require')

const RE_TEMPLATE_LITERAL = /`[^\`]+?`/mg

exports.findAll = function(content) {
  content = content.replace(RE_TEMPLATE_LITERAL, '')
  return matchRequire.findAll(content)
}
