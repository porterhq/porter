'use strict';

/* jshint esnext: true */
var golem = require('./')


module.exports = function(opts) {
  var middleware = golem(opts)
  var thunk = function(req, res) {
    return function(callback) {
      middleware(req, res, callback)
    }
  }

  return function*() {
    yield thunk(this.request, this.response)
  }
}
