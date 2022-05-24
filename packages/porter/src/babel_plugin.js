'use strict';

// https://github.com/junosuarez/heredoc/blob/master/index.js
const stripPattern = /^[ \t]*(?=[^\s]+)/mg;

function strip(text = '') {
  const indentLen = text.match(stripPattern).reduce(function (min, line) {
    return Math.min(min, line.length);
  }, Infinity);

  const indent = new RegExp('^[ \\t]{' + indentLen + '}', 'mg');
  return indentLen > 0
    ? text.replace(indent, '')
    : text;
}

const cssExtensions = [ '.css', '.less', '.sass', '.scss' ];

/**
 * @typedef { import("@babel/core").NodePath } NodePath
 */

module.exports = function({ types: t }) {
  const visitor = {
    /**
     * Remove `require('heredoc')`
     * @param {NodePath} path
     */
    VariableDeclaration(path) {
      const { node } = path;
      const { init } = node.declarations[0];
      const expr = t.isMemberExpression(init) ? init.object : init;
      if (t.isCallExpression(expr) && expr.callee.name === 'require' && expr.arguments[0].value === 'heredoc') {
        path.remove();
      }
    },

    /**
     * Transform `heredoc(function() {/* text ...})` to text.
     * @param {NodePath} path
     */
    CallExpression(path) {
      const { node } = path;
      if (node.callee.name === 'heredoc' && node.arguments.length === 1) {
        const { body } = node.arguments[0];
        if (body.type === 'BlockStatement' && body.innerComments.length === 1) {
          path.replaceWithSourceString(JSON.stringify(strip(body.innerComments[0].value)));
        }
      }
    },

    /**
     * Transform `import.meta` to `__module.meta`
     * @param {NodePath} path
     */
    MetaProperty(path) {
      const { node } = path;
      if (node.meta && node.meta.name === 'import' &&
          node.property.name === 'meta') {
        path.replaceWithSourceString('__module.meta');
      }
    },

    ImportDeclaration(path) {
      const { node } = path;
      if (!cssExtensions.some(ext => node.source.value.endsWith(ext))) return;
      if (node.specifiers.length === 0) path.remove();
    },
  };

  return { visitor };
};
