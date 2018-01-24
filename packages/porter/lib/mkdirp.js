'use strict'

const mkdirp = require('mkdirp')


module.exports = function mkdirpAsync(dir) {
  return new Promise(function(resolve, reject) {
    mkdirp(dir, function(err) {
      if (err) reject(new Error(err))
      else resolve()
    })
  })
}
