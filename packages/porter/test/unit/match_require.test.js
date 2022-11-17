'use strict';

const expect = require('expect.js');
const path = require('path');
const { readFile } = require('fs/promises');
const assert = require('assert').strict;

const matchRequire = require('../../src/match_require');

const root = path.join(__dirname, '../../../../examples/app');

describe('matchRequire.findAll()', function() {
  it('match require call statement', async function () {
    const code = await readFile(path.join(root, 'components/home.js'), 'utf8');
    const { imports } = matchRequire.findAll(code);

    expect(imports).to.contain('yen');
    // do not look into strings or comments
    expect(imports).to.not.contain('cropper/dist/cropper.css');
  });

  it('match import declaration', function () {
    const { imports } = matchRequire.findAll(`
      import * as yen from 'yen'
      import traverse from 'babel-traverse'
      import { existsSync as exists } from 'fs'

      const code = \`
        require('cropper')
        import $ from 'jquery'
      \`

      const css = '@import "cropper/dist/cropper.css"'

      export { resolve } from 'path'
    `);
    expect(imports).to.eql(['yen', 'babel-traverse', 'fs', 'path']);
  });

  it('match conditional require call statements', async function() {
    const { imports } = matchRequire.findAll(`
      if ("development" == "development") {
        require("jquery")
      } else {
        require('yen')
      }
    `);
    expect(imports).to.eql(['jquery']);
  });

  it('match conditional require in react-dom', async function() {
    const { imports } = matchRequire.findAll(`
      function checkDCE() {
        if ("production" !== 'production') {
          // This branch is unreachable because this function is only called
          // in production, but the condition is true only in development.
          // Therefore if the branch is still here, dead code elimination wasn't
          // properly applied.
          // Don't change the message. React DevTools relies on it. Also make sure
          // this message doesn't occur elsewhere in this function, or it will cause
          // a false positive.
          throw new Error('^_^');
        }
      }
      if ("production" === 'production') {
        // DCE check should happen before ReactDOM bundle executes so that
        // DevTools can report bad minification during injection.
        checkDCE();
        module.exports = require('./cjs/react-dom.production.min.js');
      } else {
        module.exports = require('./cjs/react-dom.development.js');
      }
    `);
    expect(imports).to.eql(['./cjs/react-dom.production.min.js']);
  });

  it('match else branch in conditional require if condition yields false', async function() {
    const { imports } = matchRequire.findAll(`
      if ('development' === 'production') {
        require('jquery')
      } else {
        require('yen')
      }
    `);
    expect(imports).to.eql(['yen']);
  });

  it('should not hang while parsing following code', async function() {
    const { imports } = matchRequire.findAll(`
      if ('production' !== 'production') {
        Object.freeze(emptyObject);
      }
    `);
    expect(imports).to.eql([]);
  });

  it('should match boolean condition', async function() {
    const { imports } = matchRequire.findAll(`
      if (true) {
        require('jquery')
      } else {
        require('yen')
      }
    `);
    expect(imports).to.eql(['jquery']);
  });

  it('should match else branch of the boolean condition if the condition is false', async function() {
    const { imports } = matchRequire.findAll(`
      if (false) {
        require('jquery')
      } else {
        require('yen')
      }
    `);
    expect(imports).to.eql(['yen']);
  });

  it('should match detailed boolean condition', async function() {
    const { imports } = matchRequire.findAll(`
      if (true == true) {
        require('jquery')
      } else {
        require('yen')
      }
    `);
    expect(imports).to.eql(['jquery']);
  });

  it('shoud match both if condition is not always true or false', async function() {
    const { imports } = matchRequire.findAll(`
      if (a) {
        require('jquery')
      } else {
        require('yen')
      }
    `);
    expect(imports).to.eql(['jquery', 'yen']);
  });

  it('should not match module.require()', async function() {
    const { imports } = matchRequire.findAll(`
      var types = freeModule && freeModule.require && freeModule.require('util').types;
    `);
    expect(imports).to.eql([]);
  });

  it('should skip multiple statements if negative', async function() {
    const { imports } = matchRequire.findAll(`
      var $
      var Canvas = window.Canvas

      if (true) {
        $ = require('jquery')
      } else {
        $ = require('cheerio)
        Canvas = require('canvas')
      }
    `);
    expect(imports).to.eql(['jquery']);
  });

  it('should match multiple statements if positive', async function() {
    const { imports } = matchRequire.findAll(`
      var $
      var Canvas = window.Canvas

      if (false) {
        $ = require('jquery')
      } else {
        $ = require('cheerio')
        Canvas = require('canvas')
      }
    `);
    expect(imports).to.eql(['cheerio', 'canvas']);
  });

  it('should match one liners with asi', async function() {
    const { imports } = matchRequire.findAll(`
      if (true) ColorExtactor = require('color-extractor/lib/color-extractor-canvas')
      else ColorExtactor = require('color-extractor/lib/color-extractor-im')
    `);
    expect(imports).to.eql(['color-extractor/lib/color-extractor-canvas']);
  });

  it('should match one liners with semicolon', async function() {
    const { imports } = matchRequire.findAll(`
      if (true) ColorExtactor = require('color-extractor/lib/color-extractor-canvas');else ColorExtactor = require('color-extractor/lib/color-extractor-im');
    `);
    expect(imports).to.eql(['color-extractor/lib/color-extractor-canvas']);
  });

  it ('should match one liners with ternary operator', async function() {
    const { imports } = matchRequire.findAll(`
      const foo = (true ? require('./foo') : require('./bar')) || 'foo'
    `);
    expect(imports).to.eql(['./foo']);
  });

  it('should match negative ternary one liner', async function() {
    const { imports } = matchRequire.findAll(`
      const foo = false ? require('./foo') : require('./bar')
    `);
    expect(imports).to.eql(['./bar']);
  });

  it('should match worker-loader!./parserWorker', async function() {
    const { imports } = matchRequire.findAll(`
      export function parse(svg, progress, error, callback) {
        require('worker-loader!./parserWorker.js');
      }
    `);
    expect(imports).to.contain('worker-loader!./parserWorker.js');
  });

  it('should match ./parserWorker.js?worker', async function() {
    const { imports } = matchRequire.findAll(`
      import worker from './parserWorker.js?worker&inline';
    `);
    assert.deepEqual(imports, ['./parserWorker.js?worker&inline']);
  });

  it('should match require.async()', async function() {
    const { imports, dynamicImports } = matchRequire.findAll(`
      require('foo');
      require.async('some-big-package', function(exports) {
        exports.default();
      });
    `);
    assert.deepEqual(imports, [ 'foo' ]);
    assert.deepEqual(dynamicImports, [ 'some-big-package' ]);
  });

  it('should match import()', async function() {
    const { imports, dynamicImports } = matchRequire.findAll(`
      import 'foo';
      import bar from 'bar';
      import('some-big-package').then(function(exports) {
        exports.default();
      });
    `);
    assert.deepEqual(imports, [ 'foo', 'bar' ]);
    assert.deepEqual(dynamicImports, [ 'some-big-package' ]);
  });

  it('should match unicode literal', async function() {
    const { imports } = matchRequire.findAll(`
      import "./\\u6d4b\\u8bd5\\u6570\\u636e 3.json";
    `);
    assert.deepEqual(imports, [ './\u6d4b\u8bd5\u6570\u636e 3.json' ]);
    assert.deepEqual(imports, [ './测试数据 3.json' ]);
  });
});

describe('matchRequire.decodeUnicodeLiteral', function() {
  it('should replace unicode literal', function() {
    const result = matchRequire.decodeUnicodeLiteral('./\\u6d4b\\u8bd5\\u6570\\u636e 3.json');
    assert.equal(result, './测试数据 3.json');
  });
});
