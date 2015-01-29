'use strict';

var Promise = require('bluebird')


module.exports = function(opts) {
  var golem = Promise.promisify(require('./')(opts))

  return function*(next) {
    try {
      yield golem(this.request, this.response)
    }
    catch (e) {
      yield next
      return
    }

    if (!this.body) yield next
  }
}
