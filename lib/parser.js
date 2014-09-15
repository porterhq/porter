'use strict';

/*
 * https://github.com/seajs/seajs/blob/master/src/util-deps.js
 */
var RE_REQUIRE = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\/\*[\S\s]*?\*\/|\/(?:\\\/|[^\/\r\n])+\/(?=[^\/])|\/\/.*|\.\s*require|(?:^|[^$])\brequire\s*\(\s*(["'])(.+?)\1\s*\)/g
var RE_SLASH = /\\\\/g

function parseDependencies(code) {
  var ret = []

  code.replace(RE_SLASH, '')
      .replace(RE_REQUIRE, function(m, m1, m2) {
        if (m2) {
          ret.push(m2)
        }
      })

  return ret
}


module.exports = parseDependencies
