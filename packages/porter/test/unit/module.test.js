'use strict';

const { strict: assert } = require('assert');
const path = require('path');
const Porter = require('../..');

describe('Module', function() {
  const root = path.resolve(__dirname, '../../../demo-app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'test/suite.js']
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('module.family', function() {
    it('should be iteratable with module.family', async function() {
      const packet = porter.packet.find({ name: 'lodash' });

      for (const entry of Object.values(packet.entries)) {
        const files = {};
        // family members (descendents) should only be iterated once.
        for (const mod of entry.family) {
          if (files[mod.file]) throw new Error(`duplicated ${mod.file} (${entry.file})`);
          files[mod.file] = true;
        }
      }
    });
  });

  describe('module.dynamicFamily', function() {
    it('should iterate through first level of dynamic imports', async function() {
      const entry = porter.packet.entries['test/suite.js'];
      const result = Array.from(entry.dynamicFamily, mod => path.relative(root, mod.fpath));
      assert.deepEqual(result, [
        'browser_modules/mad-import/foo.js',
        '../../node_modules/chart.js/dist/Chart.js',
        'browser_modules/dynamic-import/sum.js',
        'browser_modules/dynamic-import/foo.js',
        'browser_modules/dynamic-import/bar.js',
      ]);
    });
  });

  describe('module.lock', function() {
    it('should generate compact lock', function() {
      assert('react-color' in porter.packet.dependencies);
      assert(!('react-color' in porter.packet.entries['home.js'].lock));
    });

    it('should generate dynamic imports lock', function() {
      const { lock } = porter.packet.entries['test/suite.js'];
      const { manifest } = lock[porter.packet.name][porter.packet.version];
      const { bundles } = porter.packet;
      assert.equal(manifest['dynamic-import/sum.js'], bundles['dynamic-import/sum.js'].output);
      assert.equal(manifest['dynamic-import/foo.css'], bundles['dynamic-import/foo.css'].output);
    });
  });

  describe('module.matchImport(code)', function() {
    it('should eliminate heredoc when minify', async function() {
      const mod = porter.packet.files['home.js'];
      mod.cache = null;
      await mod.minify();
      const { code } = mod.cache;
      assert(!code.includes('heredoc'));
    });
  });

  describe('module.checkImports({ code, intermediate })', function() {
    it('should filter dynamic imports', async function() {
      const mod = porter.packet.files['dynamic-import/suite.js'];
      const { code, map } = await mod.load();
      mod.matchImport(code);
      await mod.transpile({ code, map });
      // import('chart.js');
      assert(!mod.imports.includes('chart.js'));
      assert(mod.dynamicImports.includes('chart.js'));
    });
  });

  describe('module.minify()', function() {
    it('should invalidate dev cache when minify', async function() {
      const mod = porter.packet.files['home.js'];

      // create dev cache
      mod.cache = null;
      await mod.obtain();
      const devCache = mod.cache;

      await mod.minify();
      assert.ok(mod.cache.minified);
      assert.notEqual(devCache.code, mod.cache.code);
    });
  });

  describe('module.obtain()', function() {
    it('should neglect node.js core modules such as fs', async function() {
      const packet = porter.packet.find({ name: 'fontkit' });
      const mod = packet.files['dist/main.cjs'];
      const result = await mod.obtain();
      // should be optimized away by brfs
      assert(!result.code.includes('/use.trie'));
      // should be neglected by the default options.resolve.fallback
      assert(!mod.imports.includes('fs'));
    });
  });

  describe('module.isRootEntry', function() {
    it('should recognize worker entries in dependencies as well', async function() {
      const packet = porter.packet.find({ name: '@cara/demo-worker' });
      const mod = packet.files['components/worker.js'];
      assert.equal(mod.isWorker, true);
      assert.equal(mod.isRootEntry, true);

      const main = packet.files['index.js'];
      assert.equal(main.isWorker, false);
    });
  });
});
