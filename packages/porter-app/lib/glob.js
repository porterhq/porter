'use strict'

const glob = require('glob')

module.exports = function globAsync(pattern, opts = {}) {
  return new Promise(function(resolve, reject) {
    glob(pattern, opts, function(err, entries) {
      if (err) reject(new Error(err))
      else resolve(entries)
    })
  })
}
