'use strict'

var Promise = require('native-or-bluebird')
var oceanifyFactory = require('./index')


function oceanifyGenerator(opts) {
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
    catch (e) { console.error(e.stack) /* Ignore not found error */ }

    if (!this.body) yield next
  }
}

for (var p in oceanifyFactory) {
  if (oceanifyFactory.hasOwnProperty(p)) {
    oceanifyGenerator[p] = oceanifyFactory[p]
  }
}


module.exports = oceanifyGenerator
