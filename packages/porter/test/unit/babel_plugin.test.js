'use strict';

const babel = require('@babel/core');
const { strict: assert } = require('assert');
const plugin = require('../../src/babel_plugin');

describe('test/unit/babel_plugin.test.js', function() {
  it('should remove require("heredoc")', function() {
    const result = babel.transform(`
      const heredoc = require('heredoc');
      const a = 1;
    `, { plugins: [ plugin ] });
    assert.equal(result.code, 'const a = 1;');
  });

  it('should remove require("heredoc").strip', function() {
    const result = babel.transform(`
    const heredoc = require('heredoc').strip;
    const a = 1;
  `, { plugins: [ plugin ] });
  assert.equal(result.code, 'const a = 1;');
  });

  it('should replace heredoc(function() {/* text */}) with text', function() {
    const result = babel.transform(`
      function foo() {
        const html = heredoc(function() {/*
          <!doctype html>
          <html>
            <head></head>
            <body></body>
          </html>
        */})
      }
    `, { plugins: [ plugin ]});
    assert.equal(result.code, `function foo() {
  const html = "\\n<!doctype html>\\n<html>\\n  <head></head>\\n  <body></body>\\n</html>\\n        ";
}`);
  });

  it('should replace import.meta', function() {
    const result = babel.transform(`import('./dynamic/greet').then((greet) => {
      greet(import.meta)
    })`, { plugins: [ plugin ] });
    assert.equal(result.code, `import('./dynamic/greet').then(greet => {
  greet(__module.meta);
});`);
  });

  it('should remove import "./foo.css";', function() {
    const result = babel.transform('import "./foo.css"', { plugins: [ plugin ]});
    assert.equal(result.code, '');
  });
});
