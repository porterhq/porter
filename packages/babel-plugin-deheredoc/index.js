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

module.exports = function({ types: t }) {
  const visitor = {
    VariableDeclaration(path) {
      const { node } = path;
      const { init } = node.declarations[0];
      if (t.isCallExpression(init) && init.callee.name === 'require' && init.arguments[0].value === 'heredoc') {
        path.remove();
      }
    },
    CallExpression(path) {
      const { node } = path;
      if (node.callee.name === 'heredoc' && node.arguments.length === 1) {
        const { body } = node.arguments[0];
        if (body.type === 'BlockStatement' && body.innerComments.length === 1) {
          path.replaceWithSourceString(JSON.stringify(strip(body.innerComments[0].value)));
        }
      }
    }
  };

  return { visitor };
};
