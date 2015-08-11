'use strict'

var semver = require('semver')


/*
 * The module id might be something like:
 *
 * - `ink/0.2.0/index`
 * - `ink/0.2.0/lib/display_object`
 * - @private/name/0.1.0/index
 *
 * Use this method to remove the version part out of it.
 */
function stripVersion(id) {
  var parts = id.split('/')

  for (var i = parts.length - 1; i >= 0; i--) {
    if (semver.valid(parts[i])) {
      parts.splice(i, 1)
      break
    }
  }

  return parts.join('/')
}


module.exports = stripVersion
