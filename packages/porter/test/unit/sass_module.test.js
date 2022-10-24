'use strict';

const path = require('path');
const assert = require('assert').strict;

const Porter = require('../..');

describe('SassModule', function() {
  const root = path.resolve(__dirname, '../../../demo-complex');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: 'app/web',
      entries: ['about.jsx'],
      cache: { clean: true },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  it('should resolve dependencies', async function() {
    const mod = porter.packet.files['about_dep.scss'];
    assert.deepEqual(mod.children.map(child => path.relative(root, child.fpath)), [
      'node_modules/cropperjs/src/index.scss',
    ]);
  });
});
