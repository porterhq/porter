'use strict';

var _ = require('@ali/belt')


module.exports = function(mod) {
  return _.template('define({id}, {dependencies}, function(require, exports, module) { {!factory} })', mod, JSON.stringify)
}
