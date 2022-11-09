'use strict';

const path = require('path');
const { strict: assert } = require('assert');
const Porter = require('../..');

describe('test/typescript/index.test.js', function() {
  const root = path.resolve(__dirname, '../../../demo-typescript');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      entries: [ 'app.tsx' ],
      cache: { clean: true },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('module.id', function() {
    it('should resolve ts module', async function() {
      const mod = porter.packet.files['app.tsx'];
      assert.ok(mod);
      // module id should always ends with .js
      assert.equal(path.extname(mod.id), '.js');
    });
  });

  describe('module.children', function() {
    it('should neglect d.ts', async function() {
      const mod = porter.packet.files['app.tsx'];
      assert.deepEqual(mod.children.map(child => path.relative(root, child.fpath)), [
        // react v17.x were installed, hence not resolved to workspace root
        'node_modules/react/index.js',
        'node_modules/react-dom/index.js',
        '../../node_modules/prismjs/prism.js',
        'components/home.tsx',
        'components/utils/math.js',
      ]);
    });
  });

  describe('module.obtain()', function() {
    it('should generate source map', async function() {
      const mod = porter.packet.files['app.tsx'];
      const { code, map } = await mod.obtain();
      assert.equal(typeof code, 'string');
      assert.equal(typeof map, 'object');
      assert.deepEqual(map.sources, [ `porter:///${path.relative(root, mod.fpath)}` ]);
    });

    it('should prefer cache code when match imports', async function() {
      let mod = porter.packet.files['app.tsx'];
      // generate cache
      await mod.obtain();
      assert(mod.cache);
      // reload module
      delete porter.moduleCache[mod.fpath];
      delete porter.packet.files['app.tsx'];
      mod = await porter.packet.parseEntry('app.tsx');
      assert(mod.cache);
      await mod.obtain();
      // should not contain './store.ts', './types/index.d.ts', or './utils/math.js'
      assert.deepEqual(mod.imports, [ 'react', 'react-dom', 'prismjs', './home' ]);
    });
  });
});
