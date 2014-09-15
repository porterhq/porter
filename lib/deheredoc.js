'use strict';

var UglifyJS = require('uglify-js')


module.exports = function (ast) {
  var treeTransformer = new UglifyJS.TreeTransformer(function (node, descend) {
    if (node instanceof UglifyJS.AST_Call &&
      node.args.length === 1 &&
      node.args[0] instanceof UglifyJS.AST_Function &&
      node.args[0].body.length === 0 &&
      node.args[0].end &&
      node.args[0].end.comments_before &&
      node.args[0].end.comments_before.length === 1 &&
      node.args[0].end.comments_before[0].type === 'comment2'
    ) {
      var value = node.args[0].end.comments_before[0].value
      value = value.replace(/^\s*?\n|\s*\n$/g, '')
      var arg = node.args[0].argnames[0]
      var argname = arg ? arg.name : ''
      if (argname === 'raw') {

      } else if (argname === 'oneline') {
        value = value.replace(/\s*^\s*|$/mg, '')
      } else {
        var shortest = value.split('\n').map(function (str) {
          return str.match(/^\s*/)[0].length
        }).sort(function (a, b) {
          return a - b
        })[0]
        value = value.replace(new RegExp('^.{' + shortest + '}', 'mg'), '')
      }
      return new UglifyJS.AST_String({
        value: value
      })
    }
    if (node instanceof UglifyJS.AST_Var) {
      if (node.definitions.length === 1 &&
        isHeredocDefinition(node.definitions[0])) {
        return new UglifyJS.AST_EmptyStatement()
      } else {
        node.definitions = node.definitions.filter(function (definition) {
          return !isHeredocDefinition(definition)
        })
      }
    }
    descend(node, this)
    return node
  })

  /*
   * 要排除的情景：
   *
   * - ma/pebble 中为了实现反射，有 var Klass = require(klass) 这样的调用
   */
  function isHeredocDefinition(definition) {
    return (definition.name instanceof UglifyJS.AST_SymbolVar &&
      definition.value instanceof UglifyJS.AST_Call &&
      definition.value.expression.name === 'require' &&
      definition.value.args.length === 1 &&
      definition.value.args[0] instanceof UglifyJS.AST_String &&
      definition.value.args[0].value.indexOf('heredoc') > -1) ||
      (definition.name instanceof UglifyJS.AST_SymbolVar &&
      definition.value instanceof UglifyJS.AST_Dot &&
      definition.value.expression instanceof UglifyJS.AST_Call &&
      definition.value.expression.expression.name === 'require' &&
      definition.value.expression.args.length === 1 &&
      definition.value.expression.args[0].value.indexOf('heredoc') > -1
    )
  }
  return ast.transform(treeTransformer)
}

