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
      lazyload: ['lazyload.js'],
      entries: ['home.js', 'test/suite.js', 'stylesheets/app.css'],
    });
    await fs.rm(porter.cache.path, { recursive: true, force: true });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('[Symbol.iterator]', function() {
    it('should iterate over all modules that belong to bundle', async function() {
      assert.deepEqual(Object.keys(porter.packet.bundles).sort(), [
        'home.js',
        'lazyload.js',
        'lazyload_dep.js',
        'stylesheets/app.css',
        'test/suite.js',
      ]);
      const bundle = porter.packet.bundles['home.js'];
      const modules = Array.from(bundle);
      assert.deepEqual(modules.map(mod => mod.file).sort(), [
        'cyclic-dep/foo.js',
        'home.js',
        'home_dep.js',
      ]);
    });

    it('should bundle all dependencies separately since preload is off', async function() {
      for (const dep of porter.packet.all) {
        if (dep !== porter.packet) assert.ok(dep.bundle);
      }
    });

    it('should append @babel/runtime', async function() {
      // injected by @babel/plugin-transform-runtime
      const runtime = porter.packet.find({ name: '@babel/runtime' });
      assert.ok(runtime.bundle);
      assert.ok(runtime.bundle.output);
    });

    it('should iterate over stylesheets', async function() {
      const bundle = porter.packet.bundles['stylesheets/app.css'];
      const modules = Array.from(bundle);
      assert.deepEqual(modules.map(mod => path.relative(porter.root, mod.fpath)), [
        'components/stylesheets/common/reset.css',
        'components/stylesheets/common/base.css',
        'node_modules/cropper/dist/cropper.css',
        'node_modules/prismjs/themes/prism.css',
        'components/stylesheets/app.css',
      ]);
    });

    it('should bundle json modules', async function() {
      const bundle = porter.packet.bundles['test/suite.js'];
      const files = Array.from(bundle, mod => mod.file);
      assert.deepEqual(files.filter(file => file.startsWith('require-json')), [
        'require-json/foo.json',
        'require-json/suite.js',
      ]);
    });

    it('should bundle json modules as dependency entries', async function() {
      const packet = porter.packet.find({ name: 'yen' });
      const bundle = packet.bundles['index.js'];
      const files = Array.from(bundle, mod => mod.file);
      assert.deepEqual(files.filter(file => file.endsWith('.json')), [ 'package.json' ]);
    });
  });

  describe('bundle.contenthash', function() {
    it('should refresh if bundle entries change', async function() {
      const packet = porter.packet.find({ name: '@babel/runtime' });
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

  describe('bundle.scope', function() {
    it('should narrow scope to module if lazyloaded', async function() {
      const bundle = porter.packet.bundles['lazyload.js'];
      assert.equal(bundle.scope, 'module');
      assert.deepEqual([ ...bundle ].map(mod => mod.file), [ 'lazyload.js' ]);
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
        exclude: ['react', 'react-dom', 'chart.js'],
      },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('[Symbol.iterator]', function() {
    it('should dependencies unless specificly excluded', async function() {
      const bundle = porter.packet.bundles['preload.js'];
      const modules = Array.from(bundle);

      const selfModules = modules.filter(mod => mod.packet === porter.packet);
      assert.deepEqual(selfModules.map(mod => mod.file).sort(), [
        'preload.js',
        'preload_dep.js',
      ]);

      const yenModules = modules.filter(mod => mod.packet.name === 'yen');
      assert.deepEqual(yenModules.map(mod => mod.file).sort(), [ 'events.js', 'index.js' ]);
    });

    it('should exclude isolated dependencies', async function() {
      const bundle = porter.packet.bundles['home.js'];
      const modules = Array.from(bundle);
      const preloadBundle = porter.packet.bundles['preload.js'];
      const preloadModules = Array.from(preloadBundle);

      // react is isolated from preload bundle
      const react = porter.packet.find({ name: 'react' });
      const reactModules = Array.from(react.bundle);

      assert.ok(reactModules.every(mod => !modules.includes(mod)));
      assert.ok(reactModules.every(mod => !preloadModules.includes(mod)));
      assert.ok(reactModules.some(mod => mod.packet.name === 'object-assign'));
      assert.equal(react.bundle.entry, react.main);
      assert.equal(react.bundle.output.replace(/.[a-f0-9]{8}/, ''), react.main);
    });

    it('should have dependencies of isolated packets bundled together', async function() {
      const chart = porter.packet.find({ name: 'chart.js' });
      const chartModules = Array.from(chart.bundle);
      assert.ok(chartModules.some(mod => mod.packet.name === 'moment'));
    });

    it('should still preload dependencies of isolated dependencies', async function() {
      // scheduler is dependency of react-dom, which should not be bundled separately
      const scheduler = porter.packet.find({ name: 'scheduler' });
      assert.equal(scheduler.bundle, null);
    });
  });

  describe('bundle.output', function() {
    it('should work', async function() {
      const bundle = porter.packet.bundles['home.js'];
      const { entry, output } = bundle;
      assert.ok(new RegExp(`^${entry.replace('.js', '.[a-f0-9]{8}.js')}$`).test(output));
    });
  });

  describe('bundle.contenthash', function() {
    it('should work', async function() {
      const bundle = porter.packet.bundles['home.js'];
      const { contenthash } = bundle;
      assert.ok(/[a-f0-9]{8}/.test(contenthash));
    });
  });

  describe('bundle.obtain()', function() {
    it('should obtain correct source map', async function() {
      const bundle = porter.packet.bundles['stylesheets/app.css'];
      const { map } = await bundle.obtain();
      const { sources } = JSON.parse(map.toString());
      assert.deepEqual(sources.map(source => source.replace(/^\//, '')), [
        'components/stylesheets/common/reset.css',
        'components/stylesheets/common/base.css',
        'node_modules/cropper/dist/cropper.css',
        'node_modules/prismjs/themes/prism.css',
        'components/stylesheets/app.css',
      ]);
    });
  });

  describe('bundle.fuzzyObtain()', function() {
    it('should return the same code as from bundle.obtain()', async function() {
      const bundle = porter.packet.bundles['home.js'];
      const result = await bundle.fuzzyObtain();
      const result2 = await bundle.obtain();
      assert.equal(result.code, result2.code);
      assert.ok(result2.map);
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
    await fs.rm(porter.cache.path, { recursive: true, force: true });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('bundle.output', function() {
    it('should convert extension of languages targeting js to .js', async function() {
      const bundle = porter.packet.bundles['app.tsx'];
      assert.equal(bundle.entry, 'app.tsx');
      assert.equal(path.extname(bundle.output), '.js');
    });
  });
});

describe('Bundle with CSS in JS', function() {
  const root = path.resolve(__dirname, '../../../demo-complex');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: 'app/web',
      entries: [ 'home.jsx', 'about.jsx' ],
      resolve: {
        alias: {
          '@': '',
        },
        extensions: [ '*', '.js', '.jsx', '.css', '.less' ],
        import: {
          libraryName: 'antd',
          style: true,
        },
      },
      lessOptions: {
        javascriptEnabled: true,
      },
    });
    await fs.rm(porter.cache.path, { recursive: true, force: true });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('[Symbol.iterator]', function() {
    it('should not bundle css modules into js bundle', async function() {
      const bundle = porter.packet.bundles['home.jsx'];
      const modules = [ ...bundle ];
      assert.deepEqual(modules.map(mod => path.relative(root, mod.fpath)), [
        'app/web/home_dep.js',
        'app/web/i18n/index.js',
        'app/web/utils/index.js',
        'app/web/home.jsx',
      ]);
    });

    it('should generate css bundle if there are css in js', async function() {
      const bundle = porter.packet.bundles['home.css'];
      assert.ok(bundle);
      assert.equal(bundle.format, '.css');
      const modules = [ ...bundle ];
      assert.deepEqual(modules.map(mod => path.relative(root, mod.fpath)), [
        'node_modules/cropper/dist/cropper.css',
        'app/web/stylesheets/app.less',
      ]);
    });

    it('should append css dependencies to css bundle', async function() {
      const bundle = porter.packet.bundles['about.css'];
      assert.ok(bundle);
      assert.equal(bundle.format, '.css');
      const modules = [ ...bundle ];
      assert.deepEqual(modules.map(mod => path.relative(root, mod.fpath)), [
        'node_modules/antd/lib/style/default.less',
        'node_modules/antd/lib/layout/style/index.less',
        'node_modules/antd/lib/menu/style/index.less',
        'node_modules/antd/lib/tooltip/style/index.less',
        'app/web/about.less',
      ]);
    });
  });

  describe('bundle.obtain()', function() {
    it('should work', async function() {
      const bundle = porter.packet.bundles['home.css'];
      const result = await bundle.obtain();
      assert.ok(result.code.includes('.cropper'));
      assert.ok(result.code.includes('.page'));

      const map = result.map.toJSON();
      assert.deepEqual(map.sources.map(source => source.replace(/^\//, '')), [
        'node_modules/cropper/dist/cropper.css',
        'app/web/stylesheets/app.less',
      ]);
    });
  });

  describe('bundle.output', function() {
    it('should work', async function() {
      const bundle = porter.packet.bundles['home.css'];
      assert.equal(bundle.output, `home.${bundle.contenthash}.css`);
    });
  });

  describe('bundle.outputPath', function() {
    it('should work', async function() {
      const bundle = porter.packet.bundles['home.css'];
      assert.equal(bundle.outputPath, `home.${bundle.contenthash}.css`);
    });
  });
});

describe('Bundle with WebAssembly', function() {
  const root = path.resolve(__dirname, '../../../demo-wasm');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      entries: [ 'home.js', 'test/suite.js' ],
    });
    await fs.rm(porter.cache.path, { recursive: true, force: true });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('bundle.format', async function() {
    it('should be .wasm', async function() {
      const packet = porter.packet.find({ name: '@cara/hello-wasm' });
      assert.ok(packet);
      await packet.compileAll();
      const bundle = packet.bundles['pkg/bundler/index_bg.wasm'];
      assert.ok(bundle);
      assert.equal(bundle.format, '.wasm');
      assert.equal(bundle.entry, 'pkg/bundler/index_bg.wasm');
    });
  });
});
