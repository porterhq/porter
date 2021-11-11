'use strict';

const parser = require('@babel/parser');
const { default: traverse } = require('@babel/traverse');
const { default: generate } = require('babel-generator');

const code = `
const heredoc = require('heredoc');
const a = 1;

function foo() {
  const html = heredoc(function() {/*
    <!doctype html>
    <html>
      <head></head>
      <body></body>
    </html>
  */})
}
`;

const ast = parser.parse(code, { sourceType: 'module' });

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

traverse(ast, {
  VariableDeclaration(path) {
    const { node } = path;
    const { init } = node.declarations[0];
    if (init.callee && init.callee.name === 'require' && init.arguments[0].value === 'heredoc') {
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
});

console.log(generate(ast, {} , code));
