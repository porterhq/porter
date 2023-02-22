import { parse, ParseOptions } from '@swc/core';
import { strict as assert } from 'assert';
import ImportVisitor from '../../src/import_visitor';

async function findAll(code: string, options: ParseOptions = { syntax: 'ecmascript' }) {
  const visitor = new ImportVisitor();
  const program = await parse(code, options);
  visitor.visitProgram(program);
  return visitor;
}

describe('ImportVisitor', function() {
  describe('import declaration', function() {
    it('import foo from "./foo"', async function() {
      const { imports } = await findAll('import foo from "./foo"');
      assert.deepEqual(imports,
        [ { source: './foo', names: [ { export: 'default', local: 'foo' } ] } ]);
    });

    it('import * as foo from "./foo"', async function() {
      const { imports } = await findAll('import foo from "./foo"');
      assert.deepEqual(imports,
        [ { source: './foo', names: [ { export: 'default', local: 'foo' } ] } ]);
    });
  });

  describe('import ts types', function() {
    it('import foo from "./foo.d.ts"', async function() {
      const { imports } = await findAll('import foo from "./foo.d.ts";', { syntax: 'typescript' });
      assert.deepEqual(imports, []);
    });

    it('import type Foo from "./foo"', async function() {
      const { imports } = await findAll('import type Foo from "./foo";', { syntax: 'typescript' });
      assert.deepEqual(imports, []);
    });

    it('import type { Foo } from "./foo"', async function() {
      const { imports } = await findAll('import type { Foo } from "./foo";', { syntax: 'typescript' });
      assert.deepEqual(imports, []);
    });

    it('import { Foo } from "./foo"', async function() {
      // if Foo is only referenced as ts type
      const { imports } = await findAll(`
        import { Foo } from "./foo";
        import { Bar } from "./bar";
        const foo: Foo = {};
        console.log(foo, Bar);
      `, { syntax: 'typescript' });
      assert.deepEqual(imports,
        [ { source: './bar', names: [ { export: 'Bar', local: 'Bar' } ] } ]);
    });
  });

  describe('import wasm', function() {
    it('import * as wasm from "./index_bg.wasm";', async function() {
      const { imports, dynamicImports } = await findAll('import * as wasm from "./index_bg.wasm";');
      assert.deepEqual(imports,
        [ { source: './index_bg.wasm', names: [ { export: '*', local: 'wasm' } ] } ]);
      assert.deepEqual(dynamicImports, []);
    });
  });

  describe('export from', function() {
    it('export * from "./foo"', async function() {
      const { imports, dynamicImports } = await findAll('export * from "./foo";');
      assert.deepEqual(imports, [ { source: './foo', names: [] } ]);
      assert.deepEqual(dynamicImports, []);
    });

    it('export { Foo } from "./foo"', async function() {
      const { imports, dynamicImports } = await findAll('export { Foo } from "./foo";');
      assert.deepEqual(imports,
        [ { source: './foo', names: [ { export: 'Foo', local: 'Foo' } ] } ]);
      assert.deepEqual(dynamicImports, []);
    });
  });

  describe('dynamic import', function() {
    it('import("./foo")', async function() {
      const { imports, dynamicImports } = await findAll('import("./foo")');
      assert.deepEqual(imports, []);
      assert.deepEqual(dynamicImports, [ { source: './foo' } ]);
    });

    it('import("./foo").then((exports) => {})', async function() {
      const { imports, dynamicImports } = await findAll(`
        import("./foo").then(exports => {
          console.log(exports.default);
        });
      `);
      assert.deepEqual(imports, []);
      assert.deepEqual(dynamicImports, [ { source: './foo' } ]);
    });
  });

  describe('cjs require', function() {
    it('require("./foo")()', async function() {
      const { imports, dynamicImports } = await findAll('var a = require("./foo")();');
      assert.deepEqual(imports, [ { source: './foo' } ]);
      assert.deepEqual(dynamicImports, []);
    });

    it('require("./foo").foo()', async function() {
      const { imports, dynamicImports } = await findAll("require('functions-have-names').functionsHaveConfigurableNames()");
      assert.deepEqual(imports, [ { source: 'functions-have-names' } ]);
      assert.deepEqual(dynamicImports, []);
    });

    it("require('jquery/package.json').version.split('.').shift()", async function() {
      const { imports, dynamicImports } = await findAll("require('jquery/package.json').version.split('.').shift()");
      assert.deepEqual(imports, [ { source: 'jquery/package.json' } ]);
      assert.deepEqual(dynamicImports, []);
    })
  });

  describe('import css/less/sass', function() {
    it('import "./foo.scss"', async function() {
      const { imports, dynamicImports } = await findAll('import "./foo.scss";');
      assert.deepEqual(imports, [ { source: './foo.scss', names: [] } ]);
      assert.deepEqual(dynamicImports, []);
    });
  });

  describe('loose-envify if statement', function() {
    it('match conditional require calls', async function() {
      const { imports } = await findAll(`
        if ("development" == "development") {
          require("jquery")
        } else {
          require('yen')
        }
      `);
      assert.deepEqual(imports, [ { source: 'jquery' } ]);
    });

    it('match conditional require in react-dom', async function() {
      const { imports } = await findAll(`
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
      assert.deepEqual(imports, [ { source: './cjs/react-dom.production.min.js' } ]);
    });

    it('match else branch in conditional require if condition yields false', async function() {
      const { imports } = await findAll(`
        if ('development' === 'production') {
          require('jquery')
        } else {
          require('yen')
        }
      `);
      assert.deepEqual(imports, [ { source: 'yen' } ]);
    });

    it('should not hang while parsing following code', async function() {
      const { imports } = await findAll(`
        if ('production' !== 'production') {
          Object.freeze(emptyObject);
        }
      `);
      assert.deepEqual(imports, []);
    });

    it('should match boolean condition', async function() {
      const { imports } = await findAll(`
        if (true) {
          require('jquery')
        } else {
          require('yen')
        }
      `);
      assert.deepEqual(imports, [ { source: 'jquery' } ]);
    });

    it('should match else branch of the boolean condition if the condition is false', async function() {
      const { imports } = await findAll(`
        if (false) {
          require('jquery')
        } else {
          require('yen')
        }
      `);
      assert.deepEqual(imports, [ { source: 'yen' } ]);
    });

    it('should match detailed boolean condition', async function() {
      const { imports } = await findAll(`
        if (true == true) {
          require('jquery')
        } else {
          require('yen')
        }
      `);
      assert.deepEqual(imports, [ { source: 'jquery' } ]);
    });

    it('shoud match both if condition is not always true or false', async function() {
      const { imports } = await findAll(`
        if (a) {
          require('jquery')
        } else {
          require('yen')
        }
      `);
      assert.deepEqual(imports, [ { source: 'jquery' }, { source: 'yen' } ]);
    });

    it('should not match module.require()', async function() {
      const { imports } = await findAll(`
        var types = freeModule && freeModule.require && freeModule.require('util').types;
      `);
      assert.deepEqual(imports, []);
    });

    it('should skip multiple statements if negative', async function() {
      const { imports } = await findAll(`
        var $
        var Canvas = window.Canvas

        if (true) {
          $ = require('jquery')
        } else {
          $ = require('cheerio')
          Canvas = require('canvas')
        }
      `);
      assert.deepEqual(imports, [ { source: 'jquery' } ]);
    });

    it('should match multiple statements if positive', async function() {
      const { imports } = await findAll(`
        var $
        var Canvas = window.Canvas

        if (false) {
          $ = require('jquery')
        } else {
          $ = require('cheerio')
          Canvas = require('canvas')
        }
      `);
      assert.deepEqual(imports, [ { source: 'cheerio' }, { source: 'canvas' } ]);
    });
  });

  describe('loose-envify conditional expression', function() {
    it('should match one liners with asi', async function() {
      const { imports } = await findAll(`
        if (true) ColorExtactor = require('color-extractor/lib/color-extractor-canvas')
        else ColorExtactor = require('color-extractor/lib/color-extractor-im')
      `);
      assert.deepEqual(imports, [ { source: 'color-extractor/lib/color-extractor-canvas' } ]);
    });

    it('should match one liners with semicolon', async function() {
      const { imports } = await findAll(`
        if (true) ColorExtactor = require('color-extractor/lib/color-extractor-canvas');else ColorExtactor = require('color-extractor/lib/color-extractor-im');
      `);
      assert.deepEqual(imports, [ { source: 'color-extractor/lib/color-extractor-canvas' } ]);
    });

    it ('should match one liners with ternary operator', async function() {
      const { imports } = await findAll(`
        const foo = (true ? require('./foo') : require('./bar')) || 'foo'
      `);
      assert.deepEqual(imports, [ { source: './foo' } ]);
    });

    it('should match negative ternary one liner', async function() {
      const { imports } = await findAll(`
        const foo = false ? require('./foo') : require('./bar')
      `);
      assert.deepEqual(imports, [ { source: './bar' } ]);
    });
  });

  describe('comments', function() {
    it('/* require("cropper") */', async function() {
      const { imports } = await findAll(`
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
      assert.deepEqual(imports,
        [ { source: 'yen', names: [ { export: '*', local: 'yen' } ] },
          { source: 'babel-traverse', names: [ { export: 'default', local: 'traverse' } ] },
          { source: 'fs', names: [ { export: 'existsSync', local: 'exists' } ] },
          { source: 'path', names: [ { export: 'resolve', local: 'resolve' } ] } ]);
    });
  });
});
