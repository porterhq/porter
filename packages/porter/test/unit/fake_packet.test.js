'use strict';

const { strict: assert } = require('assert');
const path = require('path');
const Porter = require('../..');


describe('FakePacket', function() {
  let target;
  let porter;

  before(async function() {
    target = new Porter({
      root: path.join(__dirname, '../../../../examples/app'),
      entries: [ 'home.js' ],
    });
    await target.ready();
    const { loaderConfig, lock } = target.packet;
    porter = new Porter({
      root: path.join(__dirname, '../../../../examples/proxy'),
      ...loaderConfig,
      lock,
    });
    await porter.ready();
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

  it('should prefer packet.lock', async function() {
    const mod = await porter.packet.parseEntry('shelter.js');
    assert.deepEqual(Object.keys(mod.lock[target.packet.name]), [ target.packet.version ]);
    assert.ok(mod.lock.react);
  });
});
