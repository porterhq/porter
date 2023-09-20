'use strict';

const path = require('path');
// const fs = require('fs/promises');
const assert = require('assert').strict;
const Porter = require('@cara/porter');

describe('examples/app/test/index.test.js', function() {
  const root = path.resolve(__dirname, '..');
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
      // cache: { clean: true },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('packet.copy', function() {
    it('should manifest preload', function() {
      const { packet } = porter;
      assert.deepEqual(Object.keys(packet.copy.manifest), [ 'preload.js', 'preload.css' ]);
    });

  });

  describe('packet.bundles', function() {
    it('should merge css bundles', async function() {
      const bundle = porter.packet.bundles['home.css'];
      assert.deepEqual(bundle.entries, [ 'home.js', 'home.css' ]);
    });
  });

  describe('packet.parsePacket', function() {
    it('should replace package name with alias if present', async function() {
      const packet = porter.packet.find({ name: 'jquery2' });
      assert.ok(packet);
      assert.equal(packet.name, 'jquery2');
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

  describe('module.matchImport()', function() {
    it('should transpile packet if module is es module', async function() {
      const packet = porter.packet.find({ name: 'jsencrypt' });
      assert.equal(packet.transpiler, porter.packet.transpiler);
      assert.equal(packet.transpiler, 'babel');
    });
  });

  describe('module.children', function() {
    it('should initialize children', async function() {
      const mod = porter.packet.files['stylesheets/app.css'];
      assert.deepEqual(Array.from(mod.children, child => path.relative(root, child.fpath)), [
        'components/stylesheets/common/base.css',
        '../../node_modules/cropper/dist/cropper.css',
        '../../node_modules/prismjs/themes/prism.css',
      ]);
    });
  });

  describe('module.lock', function() {
    it('should manifest corresponding css entry if presetn', function() {
      const mod = porter.packet.files['home.js'];
      const { packet } = porter;
      const { manifest } = mod.lock[packet.name][packet.version];
      assert.equal(manifest['home.css'], packet.bundles['home.css'].output);
    });
  });
});
