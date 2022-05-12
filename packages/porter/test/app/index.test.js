'use strict';

const path = require('path');
// const fs = require('fs/promises');
const assert = require('assert').strict;
const Porter = require('../..');

describe('test/app/index.test.js', function() {
  const root = path.resolve(__dirname, '../../../demo-app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'test/suite.js', 'stylesheets/app.css'],
      preload: 'preload',
      bundle: {
        exclude: ['react', 'react-dom', 'chart.js'],
      },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('packet.copy', function() {
    it('should manifest preload', function() {
      const { packet } = porter;
      assert.deepEqual(Object.keys(packet.copy.manifest), [ 'preload.js' ]);
    });
  });

  describe('bundle[Symbol.iterator]', function() {
    it('should include itself when bundling isolated packet', async function() {
      const packet = porter.packet.find({ name: 'react' });
      const bundle = packet.bundle;
      assert.deepEqual(Array.from(bundle, mod => path.relative(packet.dir, mod.fpath)), [
        'cjs/react.development.js',
        'index.js',
      ]);
    });
  });
});
