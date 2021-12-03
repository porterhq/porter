'use strict';

const { strict: assert } = require('assert');
const path = require('path');
const fs = require('fs/promises');
const Porter = require('../..');

describe('JsModule', function() {
  const root = path.resolve(__dirname, '../../../demo-app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'test/suite.js'],
      transpile: { only: [ 'yen' ] },
    });
    await fs.rm(porter.cache.dest, { recursive: true, force: true });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  it('should transpile dependencies with correct source map', async function() {
    const pkg = porter.package.find({ name: 'yen' });
    const mod = pkg.files['events.js'];
    const { map } = await mod.obtain();
    assert.deepEqual(map.sources, [ 'node_modules/yen/events.js' ]);
  });

  it('should not stop at broken cache', async function() {
    const mod = porter.package.files['home.js'];
    mod.loaded = false;
    const cachePath = path.join(porter.cache.dest, `${mod.id}.cache`);
    await fs.writeFile(cachePath, 'gibberish');
    await assert.doesNotReject(async function() {
      await mod.parse();
    });
  });
});
