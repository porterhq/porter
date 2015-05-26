'use strict';


function render(template, data, fn) {
  return template.replace(/\{(!?[\w\.]+)\}/g, function(m, key) {
    return (key.charAt(0) === '!' ? getValue(data, key.slice(1)) : fn(getValue(data, key))) || ''
  })

  function getValue(data, key){
    return key.split('.').reduce(function(data, key){
      return data[key]
    }, data)
  }
}


module.exports = function(mod) {
  return render('define({id}, {dependencies}, function(require, exports, module) { {!factory} })', mod, JSON.stringify)
}
