'use strict';

const path = require('path');
const { strict: assert } = require('assert');
const fs = require('fs/promises');
const Porter = require('../src/porter');

const root = path.resolve(__dirname, '../../demo-typescript');
const porter = new Porter({
  root,
  entries: [ 'app.tsx' ],
});

describe('TsModule', function() {
  before(async function() {
    await fs.rm(porter.cache.dest, { recursive: true, force: true });
    await porter.ready;
  });

  it('should resolve ts module', async function() {
    const mod = porter.package.files['app.tsx'];
    assert.ok(mod);
    // module id should always ends with .js
    assert.equal(path.extname(mod.id), '.js');
  });
});
