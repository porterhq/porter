'use strict'

var Editor = require('ez-editor')


function edit() {
  return new Editor('#editor')
    .end()
}


module.exports = edit
