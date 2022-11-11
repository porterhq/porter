'use strict';

const { strict: assert } = require('assert');
const path = require('path');
const Porter = require('../..');

describe('TsModule', function() {
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

  describe('module.load()', function() {
    it('need to neglect type imports in advance', async function() {
      const mod = porter.packet.files['app.tsx'];
      assert.deepEqual(mod.dynamicImports, ['./utils/math']);
      assert.deepEqual(mod.imports, ['react', 'react-dom', 'prismjs', 'lodash', './home']);
    });
  });
});
