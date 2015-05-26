'use strict';

var Promise = require('native-or-bluebird')
var caka = require('./index')


module.exports = function(opts) {
  function cakaAsync(req, res) {
    return new Promise(function(resolve, reject) {
      caka(req, res, function next(err) {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  return function*(next) {
    try {
      yield cakaAsync(this.request, this.response)
    }
    catch (e) {
      yield next
      return
    }

    if (!this.body) yield next
  }
}
