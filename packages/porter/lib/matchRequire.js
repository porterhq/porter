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

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
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
      while (part && part != '}' && part != 'require') next()
      if (part == 'require') findRequire()
      space()
    }
  }

  // if ('production' == 'production')
  // if ('development' != 'production')
  // if ("development" == "production")
  // if (true)
  // if (false)
  function sillyEval(temp) {
    if (temp.length == 3 && (rEqualOp.test(temp[1]) || rNotEqualOp.test(temp[1]))) {
      if (rString.test(temp[0]) && rString.test(temp[2])) {
        return (temp[0].match(rString)[2] == temp[2].match(rString)[2]) == rEqualOp.test(temp[1])
      }
      else if (temp[0] == 'true' || temp[0] == 'false') {
        return temp[0] == temp[2]
      }
    }
    else if (temp.length == 1 && (temp[0] == 'true' || temp[0] == 'false')) {
      return temp[0] == 'true'
    }
  }

  function findConditionalRequire() {
    space()
    if (part != '(') return

    space()
    const temp = []
    while (part != ')') {
      if (!rSpace.test(part)) temp.push(part)
      next()
    }
    space()

    let result = sillyEval(temp)
    if (result === true) {
      findRequireInBlock()
      space()
      // Skip over the else branch
      if (part == 'else') space()
      if (part == '{') {
        space()
        while (part != '}') next()
      } else {
        space()
        while (part && part != ';' && part != '\n') next()
      }
    }
    else if (result === false) {
      while (part && part != ';' && part != '\n' && part != 'else') next()
      if (part == 'else') {
        space()
        findRequireInBlock()
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
