'use strict';

const { strict: assert } = require('assert');
const path = require('path');
const Porter = require('../..');


describe('FakePacket', function() {
  let target;
  let porter;

  before(async function() {
    target = new Porter({
      root: path.join(__dirname, '../../../demo-app'),
    });
    await target.ready;
    const { loaderConfig } = target.packet;
    porter = new Porter({
      root: path.join(__dirname, '../../../demo-proxy'),
      ...loaderConfig,
    });
  });

  after(async function() {
    await target.destroy();
    await porter.destroy();
  });

  it('should recognize local modules', async function() {
    // should be able to parse the modules of demo-proxy, which is not proxied
    const mod = await porter.packet.parseModule('shelter.js');
    assert.ok(mod);
    assert.equal(mod.name, '@cara/demo-app');
    assert.equal(mod.file, 'shelter.js');
  });
});
