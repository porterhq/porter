'use strict';

const path = require('path');
const assert = require('assert').strict;
const Porter = require('@cara/porter');

describe('test/complex/index.test.js', function() {
  const root = path.resolve(__dirname, '..');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: 'app/web',
      entries: ['home.jsx', 'about.jsx', 'notfound.jsx', 'test/suite.js'],
      resolve: {
        alias: { '@/': '' },
        extensions: [ '*', '.js', '.jsx', '.css', '.less' ],
        import: {
          libraryName: 'antd',
          css: true,
        },
      },
      lessOptions: { javascriptEnabled: true },
      cache: { clean: true },
    });
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
        'home.css',
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

  describe('module.checkImports()', function() {
    it('should replenish dynamic imports', async function() {
      const mod = porter.packet.files['test/glob-import/suite.js'];
      assert.deepEqual(Array.from(mod.dynamicFamily, child => child.file), [
        'test/glob-import/egg ham.json',
        'test/glob-import/egg.json',
      ]);
    });

    it('should accumulate dynamic imports', async function() {
      const mod = porter.packet.files['test/suite.js'];
      assert.deepEqual(Array.from(mod.dynamicFamily, child => child.file), [
        'test/glob-import/egg ham.json',
        'test/glob-import/egg.json',
        'test/foo.jsx',
      ]);
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
        '../../node_modules/antd/lib/style/default.less',
        '../../node_modules/antd/lib/layout/style/index.less',
        '../../node_modules/antd/lib/menu/style/index.less',
        '../../node_modules/antd/lib/tooltip/style/index.less',
        'app/web/about.less',
        'app/web/about_broken.css',
        '../../node_modules/cropperjs/src/index.scss',
        'app/web/about_dep.scss',
      ]);
    });

    it('should iterate through newly parsed children after transpile', async function() {
      // incrementally parsed entry might have new children after transpile
      await porter.parseId('test/suite.js');
      const bundle = porter.packet.bundles['test/suite.js'];
      assert.ok(bundle);
      assert.equal(bundle.format, '.js');
      // TODO: might be able to refactor this away with async iterator
      await bundle.obtain();
      assert.deepEqual(Array.from(bundle, mod => path.relative(root, mod.fpath)), [
        'app/web/components/button.module.less',
        'app/web/components/button.jsx',
        'app/web/utils/string.mjs',
        'app/web/test/glob-import/suite.js',
        'app/web/test/glob-import-eager/foo bar.json',
        'app/web/test/glob-import-eager/foo.json',
        'app/web/test/glob-import-eager/suite.js',
        'app/web/test/suite.js',
      ]);
    });
  });

  describe('bundle.obtain()', function() {
    it('should work', async function() {
      const bundle = porter.packet.bundles['home.css'];
      const result = await bundle.obtain();
      assert.ok(result.code.includes('.cropper'));
      assert.ok(result.code.includes('.page'));
      assert.deepEqual(result.map.sources.map(source => source.replace(/^\//, '')), [
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

  describe('Bundle.wrap()', function() {
    it('should wrap dynamic imported json as bundle dependencies', async function() {
      const bundle = porter.packet.bundles['test/suite.js'];
      assert.deepEqual(Array.from(bundle.children, depBundle => depBundle.entry), [
        'test/suite.js',
        'test/glob-import/egg ham.json',
        'test/glob-import/egg.json',
        'test/foo.jsx',
      ]);
    });
  });
});
