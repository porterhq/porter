'use strict';

var Promise = require('native-or-bluebird')
var oceanify = require('./index')


module.exports = function(opts) {
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
    catch (e) {
      yield next
      return
    }

    if (!this.body) yield next
  }
}
