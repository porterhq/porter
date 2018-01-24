'use strict'

const semver = require('semver')


/**
 * @param  {string} id
 * @param  {Object} system
 *
 * @returns {Module}  mod
 */
function parseId(id, system) {
  const parts = id.split('/')
  const name = id[0] == '@'
    ? [parts.shift(), parts.shift()].join('/')
    : parts.shift()

  if (semver.valid(parts[0])) {
    return {
      name,
      version: parts.shift(),
      entry: parts.join('/')
    }
  }
  else if (system && system.modules && name in system.modules) {
    return {
      name,
      version: '',
      entry: parts.join('/')
    }
  }
  else {
    return { name: id }
  }
}


module.exports = parseId
