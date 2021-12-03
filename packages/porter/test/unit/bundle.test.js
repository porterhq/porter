'use strict';

const { strict: assert } = require('assert');
const fs = require('fs/promises');
const path = require('path');
const Porter = require('../..');

describe('Bundle without preload', function() {
  const root = path.resolve(__dirname, '../../../demo-app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'test/suite.js', 'stylesheets/app.css'],
    });
    await fs.rm(porter.cache.dest, { recursive: true, force: true });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  describe('[Symbol.iterator]', function() {
    it('should iterate over all modules that belong to bundle', async function() {
      assert.deepEqual(Object.keys(porter.package.bundles).sort(), [
        'home.js',
        'stylesheets/app.css',
        'test/suite.js',
      ]);
      const bundle = porter.package.bundles['home.js'];
      const modules = Array.from(bundle);
      assert.deepEqual(modules.map(mod => mod.file).sort(), [
        'cyclic-dep/foo.js',
        'home.js',
        'home_dep.js',
      ]);
    });

    it('should bundle all dependencies separately since preload is off', async function() {
      for (const dep of porter.package.all) {
        if (dep !== porter.package) assert.ok(dep.bundle);
      }
    });

    it('should append @babel/runtime', async function() {
      // injected by @babel/plugin-transform-runtime
      const runtime = porter.package.find({ name: '@babel/runtime' });
      assert.ok(runtime.bundle);
      assert.ok(runtime.bundle.output);
    });
  });

  describe('bundle.contenthash', function() {
    it('should refresh if bundle entries change', async function() {
      const packet = porter.package.find({ name: '@babel/runtime' });
      const bundle = packet.bundle;
      const { contenthash } = bundle;
      assert.ok(bundle);
      assert.ok(/[a-f0-9]{8}/.test(contenthash));
      await packet.parseEntry('helpers/maybeArrayLike.js');
      // bundle code not repacked yet
      assert.equal(bundle.contenthash, contenthash);
      await packet.pack();
      // should refresh contenthash
      assert.ok(/[a-f0-9]{8}/.test(bundle.contenthash));
      assert.notEqual(bundle.contenthash, contenthash);
    });
  });
});

describe('Bundle with preload', function() {
  const root = path.resolve(__dirname, '../../../demo-app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'test/suite.js', 'stylesheets/app.css'],
      preload: 'preload',
      bundle: {
        except: ['react', 'react-dom'],
      },
    });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  describe('[Symbol.iterator]', function() {
    it('should dependencies unless specificly excluded', async function() {
      const bundle = porter.package.bundles['preload.js'];
      const modules = Array.from(bundle);

      const selfModules = modules.filter(mod => mod.package === porter.package);
      assert.deepEqual(selfModules.map(mod => mod.file).sort(), [
        'preload.js',
        'preload_dep.js',
      ]);

      const yenModules = modules.filter(mod => mod.package.name === 'yen');
      assert.deepEqual(yenModules.map(mod => mod.file).sort(), [ 'events.js', 'index.js' ]);
    });

    it('should exclude isolated dependencies', async function() {
      const bundle = porter.package.bundles['home.js'];
      const modules = Array.from(bundle);
      const preloadBundle = porter.package.bundles['preload.js'];
      const preloadModules = Array.from(preloadBundle);

      // react is isolated from preload bundle
      const react = porter.package.find({ name: 'react' });
      const reactModules = Array.from(react.bundle);
      assert.ok(reactModules.every(mod => !modules.includes(mod)));
      assert.ok(reactModules.every(mod => !preloadModules.includes(mod)));
      assert.equal(react.bundle.entry, react.main);
      assert.equal(react.bundle.output.replace(/.[a-f0-9]{8}/, ''), react.main);
    });

    it('should still preload dependencies of isolated dependencies', async function() {
      // scheduler is dependency of react-dom, which should not be bundled separately
      const scheduler = porter.package.find({ name: 'scheduler' });
      assert.equal(scheduler.bundle, null);
    });
  });

  describe('bundle.output', function() {
    it('should work', async function() {
      const bundle = porter.package.bundles['home.js'];
      const { entry, output } = bundle;
      assert.ok(new RegExp(`^${entry.replace('.js', '.[a-f0-9]{8}.js')}$`).test(output));
    });
  });

  describe('bundle.contenthash', function() {
    it('should work', async function() {
      const bundle = porter.package.bundles['home.js'];
      const { contenthash } = bundle;
      assert.ok(/[a-f0-9]{8}/.test(contenthash));
    });
  });
});

describe('Bundle with TypeScript', function() {
  const root = path.resolve(__dirname, '../../../demo-typescript');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      entries: ['app.tsx', 'app.css'],
    });
    await fs.rm(porter.cache.dest, { recursive: true, force: true });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  describe('bundle.output', function() {
    it('should convert extension of languages targeting js to .js', async function() {
      const bundle = porter.package.bundles['app.tsx'];
      assert.equal(bundle.entry, 'app.tsx');
      assert.equal(path.extname(bundle.output), '.js');
    });
  });
});
