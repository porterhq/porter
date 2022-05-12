'use strict';

const path = require('path');
const fs = require('fs/promises');
const assert = require('assert').strict;
const Porter = require('../..');

describe('test/complex/index.test.js', function() {
  const root = path.resolve(__dirname, '../../../demo-complex');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: 'app/web',
      entries: ['home.jsx', 'about.jsx', 'notfound.jsx'],
      resolve: {
        alias: { '@/': '' },
        extensions: [ '*', '.js', '.jsx', '.css', '.less' ],
        import: {
          libraryName: 'antd',
          css: true,
        },
      },
      lessOptions: { javascriptEnabled: true },
    });
    await fs.rm(porter.cache.path, { recursive: true, force: true });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('module.children', function() {
    it('should have css dependencies parsed', async function() {
      const mod = porter.packet.files['home.jsx'];
      assert.deepEqual(mod.children.map(child => path.relative(root, child.fpath)), [
        'node_modules/react-dom/index.js',
        'node_modules/react/index.js',
        'app/web/home_dep.js',
        'app/web/utils/index.js',
        'node_modules/cropper/dist/cropper.css',
        'app/web/stylesheets/app.less',
        'app/web/components/button.jsx',
      ]);
    });

    it('should resolve less module', async function() {
      const entry = porter.packet.files['home.jsx'];
      assert.deepEqual(entry.children.map(mod => path.relative(root, mod.fpath)), [
        'node_modules/react-dom/index.js',
        'node_modules/react/index.js',
        'app/web/home_dep.js',
        'app/web/utils/index.js',
        'node_modules/cropper/dist/cropper.css',
        'app/web/stylesheets/app.less',
        'app/web/components/button.jsx',
      ]);
    });

    it('should resolve unknown module types as stub', async function() {
      const entry = porter.packet.files['notfound.jsx'];
      assert.deepEqual(entry.children.map(mod => path.relative(root, mod.fpath)), [
        'app/web/notfound_dep.coffee',
        'app/web/notfound.styl',
        'app/web/editor.jsx',
      ]);
    });
  });

  describe('module.obtain()', function() {
    it('should transpile', async function() {
      const mod = porter.packet.files['stylesheets/app.less'];
      assert.equal(mod.constructor.name, 'LessModule');
      const { code } = await mod.obtain();
      assert.ok(!code.includes('@theme-color'));
      assert.ok(code.includes('#233333'));
      assert.ok(code.includes('.page'));
    });

    it('should transpile dependencies', async function() {
      const antd = porter.packet.find({ name: 'antd' });
      const style = antd.files['lib/style/default.less'];
      assert.ok(style);
      await assert.doesNotReject(async function() {
        await style.obtain();
      });
    });
  });

  describe('packet.copy', function() {
    it('should not manifest css entry', async function() {
      const { packet } = porter;
      assert.equal(packet.copy.manifest, undefined);
    });
  });

  describe('bundle[Symbol.iterator]', function() {
    it('should not bundle css modules into js bundle', async function() {
      const bundle = porter.packet.bundles['home.jsx'];
      const modules = [ ...bundle ];
      assert.deepEqual(modules.map(mod => path.relative(root, mod.fpath)), [
        'app/web/home_dep.js',
        'app/web/i18n/index.js',
        'app/web/utils/index.js',
        'app/web/components/button.jsx',
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
        'porter:///node_modules/cropper/dist/cropper.css',
        'porter:///app/web/stylesheets/app.less',
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
