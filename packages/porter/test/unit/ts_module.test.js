'use strict';

const path = require('path');
const { strict: assert } = require('assert');
const Porter = require('../..');

describe('TsModule', function() {
  const root = path.resolve(__dirname, '../../../demo-typescript');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      entries: [ 'app.tsx' ],
    });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  it('should resolve ts module', async function() {
    const mod = porter.package.files['app.tsx'];
    assert.ok(mod);
    // module id should always ends with .js
    assert.equal(path.extname(mod.id), '.js');
  });
});
