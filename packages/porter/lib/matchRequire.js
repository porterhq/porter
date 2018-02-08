'use strict'

const jsTokens = require('js-tokens').default

const rEqualOp = /^===?$/
const rNotEqualOp = /^!==?$/
const rSpace = /^\s+$/
const rString = /^(['"'])([^\1]+)\1$/

exports.findAll = function(content) {
  const parts = content.match(jsTokens)
  const deps = []
  let i = 0
  let part

  function next() {
    part = parts[i++]
  }

  function space() {
    do {
      next()
    } while (rSpace.test(part))
  }

  function findRequire() {
    space()
    if (part == '(') {
      space()
      const m = part.match(rString)
      space()
      if (m && part == ')') {
        deps.push(m[2])
      }
    }
  }

  function findImport() {
    space()
    // import "foo"
    const m = part.match(rString)
    if (m) {
      deps.push(m[2])
    } else {
      findImportFrom()
    }
  }

  function findImportFrom() {
    while (part && part != 'from') next()
    if (part == 'from') {
      space()
      const m = part.match(rString)
      if (m) deps.push(m[2])
    }
  }

  function findRequireInBlock() {
    if (part == '{') {
      while (part != '}' && part != 'require') next()
      if (part == 'require') findRequire()
      space()
    }
  }

  function findConditionalRequire() {
    space()
    if (part == '(') {
      space()
      const temp = []
      while (part != ')') {
        if (!rSpace.test(part)) temp.push(part)
        next()
      }
      if (temp.length == 3 && (rEqualOp.test(temp[1]) || rNotEqualOp.test(temp[1])) && rString.test(temp[0]) && rString.test(temp[2])) {
        space()
        if ((temp[0].match(rString)[2] == temp[2].match(rString)[2]) == rEqualOp.test(temp[1])) {
          findRequireInBlock()
          space()
          // Skip over the else branch
          if (part == 'else') space()
          if (part == '{') {
            space()
            while (part != '}') next()
          } else {
            space()
            while (part != ';' && part != '\n') next()
          }
        } else {
          while (part != 'else') next()
          findRequireInBlock()
        }
      }
    }
  }

  next()
  while (part) {
    if (part == 'if') {
      findConditionalRequire()
    }
    else if (part == 'require') {
      findRequire()
    }
    else if (part == 'import') {
      findImport()
    }
    next()
  }

  return deps
}
