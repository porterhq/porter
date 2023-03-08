'use strict';

const { strict: assert } = require('assert');
const path = require('path');
const Porter = require('../..');
const { MODULE_LOADED } = require('../../src/constants');

describe('WasmModule', function() {
  const root = path.resolve(__dirname, '../../../../examples/app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'test/suite.js'],
      cache: { clean: true },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  it('should be able to parse json module', async function() {
    const mod = porter.packet.files['require-json/foo.json'];
    assert.equal(mod.status, MODULE_LOADED);
  });
});
