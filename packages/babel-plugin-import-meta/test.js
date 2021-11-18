'use strict';

const parser = require('@babel/parser');
const { default: traverse } = require('@babel/traverse');
const { default: generate } = require('babel-generator');

const code = `import('./dynamic/greet').then((greet) => {
  greet(import.meta)
})`;

const ast = parser.parse(code, { sourceType: 'module' });

traverse(ast, {
  MetaProperty(path) {
    const { node } = path;
    if (node.meta && node.meta.name === 'import' &&
        node.property.name === 'meta') {
      path.replaceWithSourceString('__module.meta');
    }
  }
});

console.log(generate(ast, {} , code));
