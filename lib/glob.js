'use strict'

const glob = require('glob')


module.exports = function globAsync(pattern) {
  return new Promise(function(resolve, reject) {
    glob(pattern, function(err, entries) {
      if (err) reject(new Error(err))
      else resolve(entries)
    })
  })
}
