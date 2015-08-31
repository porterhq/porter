'use strict'

var $ = require('yen')

module.exports = function() {
  console.log($('body').attr('foo'))
}
