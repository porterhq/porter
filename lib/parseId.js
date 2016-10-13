'use strict'

const semver = require('semver')


function parseId(id) {
  const parts = id.split('/')
  const name = id.startsWith('@')
    ? [parts.shift(), parts.shift()].join('/')
    : parts.shift()


  if (semver.valid(parts[0])) {
    return {
      name: name,
      version: parts.shift(),
      entry: parts.join('/')
    }
  }
  else {
    return { name: id }
  }
}


module.exports = parseId