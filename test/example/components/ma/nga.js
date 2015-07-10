'use strict'

var $ = require('yen')
var heredoc = require('heredoc')


function render(template, data) {
  return template.replace(/\{[^\}]+\}/g, function(m, key) {
    return data[key]
  })
}

function Stage() {}

Stage.prototype.render = function() {
  $(this.stage).html(
    render(heredoc(function(oneline) {/*
      <div></div>
    */}), this.data)
  )
}

function show(opts) {
  return new Stage(opts)
}


module.exports = show
