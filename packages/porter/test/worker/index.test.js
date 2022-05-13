'use strict';

const path = require('path');
// const fs = require('fs/promises');
const assert = require('assert').strict;
const Porter = require('../..');

describe('test/app/index.test.js', function() {
  const root = path.resolve(__dirname, '../../../demo-worker');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      entries: ['home.js', 'test/suite.js'],
      bundle: {
        exclude: ['@cara/hello-worker'],
      },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('bundle[Symbol.iterator]', function() {
    it('should include itself', function() {
      const packet = porter.packet.find({ name: '@cara/hello-worker' });
      const bundle = packet.bundles['worker.js'];
      assert.deepEqual(Array.from(bundle, mod => path.relative(packet.dir, mod.fpath)), [
        'worker_dep.js',
        'worker.js',
      ]);
    });
  });
});
