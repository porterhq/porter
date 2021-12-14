'use strict';

const path = require('path');
const fs = require('fs/promises');
const { strict: assert } = require('assert');
const Porter = require('../..');

describe('test/unit/stub.test.js', function() {
  const root = path.resolve(__dirname, '../../../demo-complex');
  let porter;

  before(async function() {
    await fs.rm(path.join(root, 'public'), { recursive: true, force: true });
    porter = new Porter({
      root,
      paths: 'app/web',
      entries: [ 'notfound.jsx' ],
    });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  it('should resolve unknown module types as stub', async function() {
    const entry = porter.packet.files['notfound.jsx'];
    assert.deepEqual(entry.children.map(mod => path.relative(root, mod.fpath)), [
      'app/web/notfound_dep.coffee',
      'app/web/notfound.styl',
    ]);
  });
});
