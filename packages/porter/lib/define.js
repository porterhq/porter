'use strict'

/**
 * @module
 */

function getValue(data, keys){
  return keys.split('.').reduce(function(obj, key){
    return obj[key]
  }, data)
}

function render(template, data, fn) {
  return template.replace(/\{(!?[\w\.]+)\}/g, function(m, key) {
    return (key.charAt(0) === '!' ? getValue(data, key.slice(1)) : fn(getValue(data, key))) || ''
  })
}


/**
 * @param  {string} id
 * @param  {Array}  dependencies
 * @param  {string} factory
 *
 * @return {string}
 *
 * ```js
 * define(id, dependencies, function(require, exports, module) {
 *   factory
 * })
 * ```
 */
function define(id, dependencies, factory) {
  return render('define({id}, {dependencies}, function(require, exports, module) {{!factory}\n})', {
    id: id, dependencies: dependencies, factory: factory
  }, JSON.stringify)
}


module.exports = define
