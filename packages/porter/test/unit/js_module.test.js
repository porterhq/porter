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
      cache: { clean: true },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  it('should transpile dependencies with correct source map', async function() {
    const pkg = porter.packet.find({ name: 'yen' });
    const mod = pkg.files['events.js'];
    const { map } = await mod.obtain();
    assert.deepEqual(map.sources, [ 'porter:///node_modules/yen/events.js' ]);
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

  it('should support arbitrary conditional require', async function() {
    // process.env.NODE_ENV === 'production'
    await porter.packet.parsePacket({ name: 'mobx' });
    const pkg = porter.packet.find({ name: 'mobx' });
    const mod = pkg.files['dist/index.js'];
    await mod.obtain();
    assert.deepEqual(mod.imports, [ './mobx.cjs.development.js' ]);
  });

  it('should recognize dynamic imports', async function() {
    const mod = await porter.packet.parseEntry('dynamic_imports.js');
    assert.ok(mod);
    // static imports is empty
    assert.deepEqual(mod.imports, []);
    assert.deepEqual(mod.dynamicImports, [ 'react' ]);
    await porter.pack();
    const react = porter.packet.find({ name: 'react' });
    assert.deepEqual(Object.keys(mod.lock.react), [ react.version ]);
  });

  it('should distinguish dynamic imports', async function() {
    const mod = porter.packet.files['dynamic-import/suite.js'];
    assert.ok(mod);
    assert.ok(mod.dynamicChildren.length > 0);
    assert.ok(mod.dynamicChildren.find(child => child.file === 'dynamic-import/sum.js'));
  });
});

describe('JsModule uglifyOptions', function() {
  const root = path.resolve(__dirname, '../../../demo-app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'test/suite.js'],
      uglifyOptions: {
        keep_fnames: /home\.js$/,
      }
    });
    await fs.rm(porter.cache.path, { recursive: true, force: true });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  it('should pass on uglify options', async function() {
    const mod = porter.packet.files['home.js'];
    const result = await mod.minify();
    assert(result.code.includes('function demoCropper'));
  });
});
