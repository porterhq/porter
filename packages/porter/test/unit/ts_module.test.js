'use strict';

const path = require('path');
const { strict: assert } = require('assert');
const fs = require('fs/promises');
const Porter = require('../..');

describe('TsModule', function() {
  const root = path.resolve(__dirname, '../../../demo-typescript');
  let porter;

  before(async function() {
    await fs.rm(path.join(root, 'public'), { recursive: true, force: true });
    porter = new Porter({
      root,
      entries: [ 'app.tsx' ],
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  it('should resolve ts module', async function() {
    const mod = porter.packet.files['app.tsx'];
    assert.ok(mod);
    // module id should always ends with .js
    assert.equal(path.extname(mod.id), '.js');
  });

  it('should neglect d.ts', async function() {
    const mod = porter.packet.files['app.tsx'];
    assert.deepEqual(mod.children.map(child => path.relative(root, child.fpath)), [
      'node_modules/react/index.js',
      'node_modules/react-dom/index.js',
      'node_modules/prismjs/prism.js',
      'components/home.tsx',
      'components/utils/math.js',
    ]);
  });

  it('should generate source map', async function() {
    const mod = porter.packet.files['app.tsx'];
    const { code, map } = await mod.obtain();
    assert.equal(typeof code, 'string');
    assert.equal(typeof map, 'object');
    assert.equal(map.file, path.relative(root, mod.fpath));
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
