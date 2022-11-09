'use strict';

const path = require('path');
const { strict: assert } = require('assert');
const Porter = require('@cara/porter');

describe('packages/demo-typescript/test/babel.test.js', function() {
  const root = path.resolve(__dirname, '..');
  let porter;
  let packetFn;
  let tryRequire;

  before(async function() {
    porter = new Porter({
      root,
      entries: ['app.tsx', 'about.tsx'],
      cache: { clean: true },
      transpile: { typescript: 'babel' },
    });
    packetFn = porter.packet.constructor.prototype;
    tryRequire = packetFn.tryRequire;
    packetFn.tryRequire = function stubTryRequire(specifier) {
      if (specifier === 'typescript') return null;
      return tryRequire.call(this, specifier);
    };
    await porter.ready();
  });

  after(async function() {
    packetFn.tryRequire = tryRequire;
    await porter.destroy();
  });

  describe('porter.typescript', function() {
    it('should disable tsc', function() {
      assert.notEqual(porter.transpile.typescript, 'tsc');
    });
  });

  describe('module.load()', function() {
    it('need to neglect type imports in advance', async function() {
      const mod = porter.packet.files['app.tsx'];
      assert.deepEqual(mod.dynamicImports, ['./utils/math']);
      assert.deepEqual(mod.imports, ['react', 'react-dom', 'prismjs', './home']);
    });
  });

  describe('module.transpile()', function() {
    it('should neglect dependencies excluded by babel plugin', async function() {
      const mod = porter.packet.files['about.tsx'];
      assert.deepEqual(mod.imports, ['react', 'react-dom']);
    });
  });
});
