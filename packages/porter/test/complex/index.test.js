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

  describe('.browserslistrc', function() {
    it('should transpile with correct targets setting', async function() {
      const mod = porter.packet.files['utils/index.js'];
      const { code } = await mod.obtain();
      assert.ok(code.includes('async function'));
    });
  });

  describe('module.id', function() {
    it('should convert extension to .js', async function() {
      const mod = porter.packet.files['about.jsx'];
      assert.equal(mod.id, 'about.js');
    });
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
        'app/web/notfound.jsx',
      ]);
    });

    it('should resolve less module', async function() {
      const mod = porter.packet.files['home.jsx'];
      assert.deepEqual(mod.children.map(child => path.relative(root, child.fpath)), [
        'node_modules/react-dom/index.js',
        'node_modules/react/index.js',
        'app/web/home_dep.js',
        'app/web/utils/index.js',
        'node_modules/cropper/dist/cropper.css',
        'app/web/stylesheets/app.less',
        'app/web/components/button.jsx',
        'app/web/notfound.jsx',
      ]);
    });

    it('should recognize css modules', async function() {
      const mod = porter.packet.files['components/button.jsx'];
      assert.deepEqual(mod.children.map(child => path.relative(root, child.fpath)), [
        'node_modules/react/index.js',
        'app/web/components/button.module.less',
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

  describe('module.lock', function() {
    it('should manifest root entries if imported', async function() {
      const mod = porter.packet.files['home.jsx'];
      const { manifest } = mod.lock[porter.packet.name][porter.packet.version];
      assert.deepEqual(Object.keys(manifest), [
        'editor.css',
        'editor.js',
        'notfound.js',
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

    it('should transpile css modules with exports', async function() {
      const mod = porter.packet.files['components/button.module.less'];
      await mod.obtain();
      assert.ok(mod.constructor.name, 'LessModule');
      assert.ok(mod.exports);
      assert.ok(mod.exports.constructor.name, 'JsonModule');
    });

    it.skip('should transpile custom media', async function() {
      const mod = await porter.packet.parseEntry('detail.css');
      const { code } = await mod.obtain();
      assert.ok(!code.includes('@custom-media'));
      assert.ok(code.includes('@media (max-width: 50rem)'));
    });
  });

  describe('packet.copy', function() {
    it('should not manifest css entry', async function() {
      const { packet } = porter;
      assert.equal(packet.copy.manifest, undefined);
    });
  });

  describe('packet.reload()', function() {
    it('should reload corresponding css bundle', async function() {
      const { packet } = porter;
      const bundle = packet.bundles['about.css'];
      assert.ok(bundle.output);
      await packet.reload('change', 'about_dep.js');
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.ok(!bundle.output);
    });
  });

  describe('bundle[Symbol.iterator]', function() {
    it('should bundle css modules into js bundle', async function() {
      const bundle = porter.packet.bundles['home.jsx'];
      assert.deepEqual(Array.from(bundle, mod => path.relative(root, mod.fpath)), [
        'app/web/home_dep.js',
        'app/web/i18n/index.js',
        'app/web/utils/index.js',
        'app/web/components/button.module.less',
        'app/web/components/button.jsx',
        'app/web/home.jsx',
      ]);
    });

    it('should generate css bundle if there are css in js', async function() {
      const bundle = porter.packet.bundles['home.css'];
      assert.ok(bundle);
      assert.equal(bundle.format, '.css');
      assert.deepEqual(Array.from(bundle, mod => path.relative(root, mod.fpath)), [
        'node_modules/cropper/dist/cropper.css',
        'app/web/stylesheets/app.less',
        'app/web/components/button.module.less',
      ]);
    });

    it('should append css dependencies to css bundle', async function() {
      const bundle = porter.packet.bundles['about.css'];
      assert.ok(bundle);
      assert.equal(bundle.format, '.css');
      assert.deepEqual(Array.from(bundle, mod => path.relative(root, mod.fpath)), [
        'node_modules/antd/lib/style/default.less',
        'node_modules/antd/lib/layout/style/index.less',
        'node_modules/antd/lib/menu/style/index.less',
        'node_modules/antd/lib/tooltip/style/index.less',
        'app/web/about.less',
        'app/web/about_broken.css',
        'node_modules/cropperjs/src/index.scss',
        'app/web/about_dep.scss',
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
        'porter:///app/web/components/button.module.less',
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
