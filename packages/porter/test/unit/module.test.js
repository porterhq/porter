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

  it('should be iteratable with module.family', async function() {
    const pkg = porter.packet.find({ name: 'lodash' });

    for (const entry of Object.values(pkg.entries)) {
      const files = {};
      // family members (descendents) should only be iterated once.
      for (const mod of entry.family) {
        if (files[mod.file]) throw new Error(`duplicated ${mod.file} (${entry.file})`);
        files[mod.file] = true;
      }
    }
  });

  it('should generate compact lock', function() {
    assert('react-color' in porter.packet.dependencies);
    assert(!('react-color' in porter.packet.entries['home.js'].lock));
  });

  it('should eliminate heredoc when minify', async function() {
    const mod = porter.packet.files['home.js'];
    mod.cache = null;
    await mod.minify();
    const { code } = mod.cache;
    assert(!code.includes('heredoc'));
  });

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
