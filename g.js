'use strict'

var Promise = require('native-or-bluebird')
var oceanifyFactory = require('./index')


module.exports = function(opts) {
  var oceanify = oceanifyFactory(opts)

  function oceanifyAsync(req, res) {
    return new Promise(function(resolve, reject) {
      oceanify(req, res, function next(err) {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  return function*(next) {
    try {
      yield oceanifyAsync(this.request, this.response)
    }
    catch (e) { /* Ignore not found error */ }

    if (!this.body) yield next
  }
}
