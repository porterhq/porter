'use strict';

const babel = require('@babel/core');
const { strict: assert } = require('assert');
const path = require('path');
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

  it('should replace import.meta.url', function() {
    const result = babel.transform(`import('./dynamic/greet').then((greet) => {
      greet(import.meta.url)
    })`, { plugins: [ plugin ] });
    assert.equal(result.code, `import('./dynamic/greet').then(greet => {
  greet(__module.meta.url);
});`);
  });

  it('should replace import.meta.glob()', function() {
    const result = babel.transform("const files = import.meta.glob('./test/*.mjs')", { 
      plugins: [ plugin ],
      filename: path.join(__dirname, '../../loader.js'),
    });
    assert.equal(result.code, `const files = {
  "./test/hooks.mjs": () => import("./test/hooks.mjs")
};`);
  });

  it('should replace import.meta.glob(pattern, { eager: true })', function() {
    const result = babel.transform("const files = import.meta.glob('./test/*.mjs', { eager: true })", { 
      plugins: [ plugin ],
      filename: path.join(__dirname, '../../loader.js'),
    });
    assert.equal(result.code, `import * as __glob_0_0 from "./test/hooks.mjs";
const files = {
  "./test/hooks.mjs": __glob_0_0
};`);
  });

  it('should hoist import.meta.glob() if nested', function() {
    const result = babel.transform(`import assert from 'assert/strict';
function foo() {
  const files = import.meta.glob('./test/*.mjs', { eager: true });
  assert.deepEqual(Object.keys(files), ['./test/hooks.mjs']);
}`, { 
      plugins: [ plugin ],
      filename: path.join(__dirname, '../../loader.js'),
    });
    assert.equal(result.code, `import assert from 'assert/strict';
import * as __glob_1_0 from "./test/hooks.mjs";
function foo() {
  const files = {
    "./test/hooks.mjs": __glob_1_0
  };
  assert.deepEqual(Object.keys(files), ['./test/hooks.mjs']);
}`);
  });

  it('should remove import "./foo.css";', function() {
    const result = babel.transform('import "./foo.css"', { plugins: [ plugin ]});
    assert.equal(result.code, '');
  });
});
