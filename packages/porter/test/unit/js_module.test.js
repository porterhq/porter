'use strict';

const { strict: assert } = require('assert');
const path = require('path');
const fs = require('fs/promises');
const Porter = require('../..');
const { MODULE_LOADED } = require('../../src/constants');

describe('JsModule', function() {
  const root = path.resolve(__dirname, '../../../demo-app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'test/suite.js'],
      transpile: { include: [ 'yen' ] },
    });
    await fs.rm(porter.cache.path, { recursive: true, force: true });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  it('should transpile dependencies with correct source map', async function() {
    const pkg = porter.packet.find({ name: 'yen' });
    const mod = pkg.files['events.js'];
    const { map } = await mod.obtain();
    assert.deepEqual(map.sources, [ 'node_modules/yen/events.js' ]);
  });

  it('should not stop at broken cache', async function() {
    const mod = porter.packet.files['home.js'];
    mod.loaded = false;
    const cachePath = path.join(porter.cache.path, `${mod.id}.cache`);
    await fs.writeFile(cachePath, 'gibberish');
    await assert.doesNotReject(async function() {
      await mod.parse();
    });
  });

  it('should set status to MODULE_LOADED after parse', async function() {
    const mod = porter.packet.files['home.js'];
    assert.equal(mod.status, MODULE_LOADED);
  });
});

describe('JsModule import CSS', function() {
  const root = path.resolve(__dirname, '../../../demo-complex');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: 'app/web',
      entries: ['home.jsx'],
      resolve: {
        extensions: [ '*', '.js', '.jsx', '.css', '.less' ],
      },
    });
    await fs.rm(porter.cache.path, { recursive: true, force: true });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  it('should have css dependencies parsed', async function() {
    const mod = porter.packet.files['home.jsx'];
    assert.deepEqual(mod.children.map(child => path.relative(root, child.fpath)), [
      'node_modules/react-dom/index.js',
      'node_modules/react/index.js',
      'app/web/home_dep.js',
      'node_modules/cropper/dist/cropper.css',
      'app/web/stylesheets/app.less',
    ]);
  });
});
