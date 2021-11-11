'use strict';

var $ = require('yen');

$.fn.reveal = function() {
  return this.each(function(el) {
    $(el)
      .removeClass('hidden')
      .css('display', '');
  });
};
