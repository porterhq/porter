'use strict'

var semver = require('semver')

var RE_DIGEST = /-[0-9a-f]{8}$/


/*
 * The module id might be something like:
 *
 * - `ink/0.2.0/index`
 * - `ink/0.2.0/lib/display_object`
 * - `ma/nga-7ad21da2`
 *
 * Use this method to remove the version part out of it.
 */
function stripVersion(id) {
  if (RE_DIGEST.test(id)) {
    return id.replace(RE_DIGEST, '')
  }
  else {
    var parts = id.split('/')

    for (var i = parts.length - 1; i >= 0; i--) {
      if (semver.valid(parts[i])) {
        parts.splice(i, 1)
        break
      }
    }

    return parts.join('/')
  }
}


module.exports = stripVersion
