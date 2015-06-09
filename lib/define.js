'use strict'


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


module.exports = function(mod) {
  return render('define({id}, {dependencies}, function(require, exports, module) { {!factory} })', mod, JSON.stringify)
}
