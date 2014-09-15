'use strict';

var UglifyJS = require('uglify-js')
var deheredoc = require('../deheredoc')
var ast = require('./ast')

// https://github.com/mishoo/UglifyJS2#compressor-options
var compressor = UglifyJS.Compressor()


function cmdize(id, code) {
  var tree = deheredoc(
    ast.getAst('define(function(require, exports, module) {' + code + '})')
  )
  var define = ast.parseFirst(tree)
  var dependencies = define.dependencies

  for (var i = dependencies.length - 1; i >= 0; i--) {
    if (/\/heredoc$/.test(dependencies[i])) {
      dependencies.splice(i, 1)
    }
  }

  ast.modify(tree, {
    id: id.replace(/\.js$/, ''),
    dependencies: dependencies
  })

  tree.figure_out_scope()

  var compressed = tree.transform(compressor)

  compressed.figure_out_scope()
  compressed.compute_char_frequency()
  compressed.mangle_names()

  return compressed.print_to_string({ ascii_only: true })
}


module.exports = cmdize
