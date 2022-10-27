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
      entries: ['home.js', 'home.css', 'test/suite.js', 'stylesheets/app.css'],
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

  describe('packet.bundles', function() {
    it('should merge css bundles', async function() {
      const bundle = porter.packet.bundles['home.css'];
      assert.deepEqual(bundle.entries, [ 'home.js', 'home.css' ]);
    });
  });

  describe('bundle[Symbol.iterator]', function() {
    it('should include itself when bundling isolated packet', async function() {
      const packet = porter.packet.find({ name: 'react' });
      const bundle = packet.bundle;
      assert.deepEqual(Array.from(bundle, child => path.relative(root, child.fpath)), [
        'node_modules/react/cjs/react.development.js',
        'node_modules/react/index.js',
      ]);
    });
  });

  describe('module.children', function() {
    it('should initialize children', async function() {
      const mod = porter.packet.files['stylesheets/app.css'];
      assert.deepEqual(Array.from(mod.children, child => path.relative(root, child.fpath)), [
        'components/stylesheets/common/base.css',
        'node_modules/cropper/dist/cropper.css',
        'node_modules/prismjs/themes/prism.css',
      ]);
    });
  });
});
