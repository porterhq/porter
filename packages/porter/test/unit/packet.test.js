'use strict';

const assert = require('assert').strict;
const path = require('path');
const expect = require('expect.js');
const fs = require('fs/promises');
const util = require('util');

const glob = util.promisify(require('glob'));

const Porter = require('../..');

describe('Packet', function() {
  const root = path.resolve(__dirname, '../../../../examples/app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.css', 'home.js', 'test/suite.js', 'stylesheets/app.css'],
      resolve: {
        alias: {
          '@/': '',
        },
      },
      bundle: {
        async exists(bundle) {
          const { app } = bundle;
          const fpath = path.join(app.output.path, bundle.outputPath);
          return await fs.access(fpath).then(() => true).catch(() => false);
        }
      },
      cache: { clean: true },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('packet.copy', function() {
    it('shoud not include bundle dependencies', async function() {
      const { packet } = porter;
      const { manifest = {} } = packet.copy;
      assert.equal(manifest['dynamic-import/foo.js'], undefined);
      assert.equal(manifest['dynamic-import/foo.css'], undefined);
    });
  });

  describe('packet.resolve()', function() {
    it('resolve object-inspect', async function() {
      const inspect = porter.packet.find({ name: 'object-inspect' });
      assert.ok(inspect);
      // ./util.inspect is neglected in browser field of object-inspect
      assert.ok(!inspect.files.hasOwnProperty('util.inspect.js'));
    });

    it('resolve alias', async function() {
      const mod = await porter.packet.parseFile('@/home_dep.js');
      assert.equal(mod, porter.packet.files['home_dep.js']);
    });

    it('normalize relative path ./', async function() {
      const callBind = porter.packet.find({ name: 'call-bind' });
      assert.ok(callBind);
      assert.deepEqual(Object.keys(callBind.files), [ 'index.js', 'callBound.js' ]);
    });
  });

  describe('packet.parseFile()', function() {
    it('parse into recursive dependencies map by traversing components', function() {
      expect(porter.packet.name).to.be('@cara/demo-app');
      expect(porter.packet.dependencies.yen.version).to.equal('1.2.4');
    });

    it('parse require directory in components', function() {
      expect(porter.packet.folder).to.eql({
        'require-directory/math': true,
      });
    });

    it('parse require directory in node_modules', function() {
      expect(porter.packet.dependencies.inferno.folder).to.eql({ 'dist': true });
    });

    it('parse require dir/ in node_modules', function() {
      // no need to track specifiers like require('lib/animations/transitions/')
      // because loader.js has that kind of specifiers covered already.
      expect(porter.packet.dependencies['react-stack-grid'].folder).to.eql({});
    });

    if (process.platform == 'darwin' || process.platform == 'win32') {
      it('should warn if specifier is not fully resolved', async function() {
        this.sinon.spy(console, 'warn');
        await porter.packet.parseFile('Home.js');
        assert(console.warn.calledWithMatch('case mismatch'));
      });
    }

    it('recognize css @import', function() {
      const cssFiles = Object.keys(porter.packet.files).filter(file => file.endsWith('.css'));
      expect(cssFiles.sort()).to.eql([
        'dynamic-import/baz.css',
        'dynamic-import/foo.css',
        'home.css',
        'home_dep.css',
        'stylesheets/app.css',
        'stylesheets/common/base.css',
        'stylesheets/common/reset.css',
        'test/suite.css',
      ]);
    });

    it('recognize browser field', function() {
      const stream = porter.packet.find({ name: 'readable-stream' });
      const files = Object.keys(stream.files);
      expect(files).to.contain('lib/internal/streams/stream-browser.js');
      expect(files).to.contain('readable-browser.js');
      expect(files).to.not.contain('readable.js');
      expect(files).to.contain('errors-browser.js');
      expect(files).to.not.contain('errors.js');
    });

    it('disable module in browser field', function() {
      const iconv = porter.packet.find({ name: 'iconv-lite' });
      expect(Object.keys(iconv.files)).to.not.contain('lib/extend-node');
      expect(Object.keys(iconv.files)).to.not.contain('lib/streams');
    });

    it('should not still require stream', function() {
      // because lib/streams is already neglected in browser field
      const iconv = porter.packet.find({ name: 'iconv-lite' });
      expect(Object.keys(iconv.dependencies)).to.not.contain('stream');
    });

    it('should fallback stream to readable-stream', function() {
      const restructure = porter.packet.find({ name: 'restructure' });
      assert.deepEqual(restructure.browser, { stream: 'readable-stream' });
    });
  });

  describe('packet.prepare()', function() {
    it('should recognize packet.babel', async function() {
      const porter2 = new Porter({
        root: path.join(__dirname, '../fixtures/demo-package-babel'),
      });
      await porter2.ready();
      assert.equal(porter2.packet.transpiler, 'babel');
      assert.deepEqual(porter.packet.transpilerOpts.presets, [ '@babel/preset-env' ]);
    });

    it('should recognize .babelrc', async function() {
      assert.equal(porter.packet.transpiler, 'babel');
      assert.deepEqual(porter.packet.transpilerOpts.presets, [ '@babel/preset-env' ]);
    });

    it('should recognize babel.config.js', async function() {
      const porter3 = new Porter({
        root: path.join(__dirname, '../fixtures/demo-package-babel-config-js'),
        paths: ['components'],
      });
      await porter3.ready();
      assert.equal(porter3.packet.transpiler, 'babel');
      assert.deepEqual(porter3.packet.transpilerOpts.presets, [ '@babel/preset-env' ]);
      assert.deepEqual(porter3.packet.transpilerOpts.plugins, [
        '@babel/plugin-transform-react-jsx',
        '@babel/plugin-proposal-object-rest-spread',
        ['@babel/plugin-proposal-decorators', { 'legacy': true}],
        ['@babel/plugin-proposal-class-properties', { 'loose': false}],
        ['@babel/plugin-proposal-private-methods', { 'loose': false }],
        path.resolve(path.join(__dirname, '../../src/babel_plugin.js')),
      ]);
    });

    it('should set transpiler for dependencies if enabled', async function() {
      const porter2 = new Porter({
        root,
        entries: [ 'home.js' ],
        transpile: {
          include: [ 'yen' ],
        },
      });
      await porter2.ready();
      const packet = porter2.packet.find({ name: 'yen' });
      assert.equal(packet.transpiler, 'babel');
    });
  });

  describe('packet.find()', function() {
    it('should find({ name, version })', function() {
      const name = 'yen';
      const version = '1.2.4';
      const pkg = porter.packet.find({ name, version });
      expect(pkg.name).to.eql(name);
      expect(pkg.version).to.eql(version);
    });

    it('should find({ name })', function() {
      const pkg = porter.packet.find({ name: 'react' });
      expect(pkg.name).to.eql('react');
    });
  });

  describe('packet.findAll()', function() {
    it('should findAll({ name })', function() {
      const packets = porter.packet.findAll({ name: 'react' });
      expect(packets[0].name).to.eql('react');
    });
  });

  describe('packet.compile()', function () {
    it('should reuse existing bundle', async function() {
      const packet = porter.packet.find({ name: 'react' });
      const { bundle, main } = packet;
      assert.ok(bundle);
      const compiledBundle = await packet.compile(main);
      assert.equal(bundle, compiledBundle);
    });

    it('should compile with packet.compile(...entries)', async function () {
      const pkg = porter.packet.find({ name: 'react' });
      const { name, main } = pkg;
      const bundle = await pkg.compile(main);
      const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root });
      expect(entries).to.contain(`public/${bundle.outputPath}`);
      expect(entries).to.contain(`public/${bundle.outputPath}.map`);
    });

    it('should generate source map of modules as well', async function() {
      const pkg = porter.packet.find({ name: 'react' });
      const { main, } = pkg;
      const bundle = await pkg.compile(main);
      const fpath = path.join(root, 'public', `${bundle.outputPath}.map`);
      const map = JSON.parse(await fs.readFile(fpath, 'utf8'));
      // options.source.serve mode
      expect(map.sources).to.contain('node_modules/react/index.js');
    });

    it('should compile packet with different main entry', async function () {
      const pkg = porter.packet.find({ name: 'chart.js' });
      const { name, main,  } = pkg;
      const bundle = await pkg.compile(main);
      const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root });
      expect(entries).to.contain(`public/${bundle.outputPath}`);
      expect(entries).to.contain(`public/${bundle.outputPath}.map`);
    });

    it('should compile entry with folder module', async function() {
      const pkg = porter.packet.find({ name: 'react-datepicker' });
      const { name, main } = pkg;
      await pkg.compileAll();
      const bundle = pkg.bundles[main];
      const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root });
      expect(entries).to.contain(`public/${bundle.outputPath}`);
      expect(entries).to.contain(`public/${bundle.outputPath}.map`);
    });

    it('should compile entry with browser field', async function() {
      const pkg = porter.packet.find({ name: 'cropper' });
      const { name, main, dir } = pkg;
      const bundle = await pkg.compile(main);
      const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root });
      expect(entries).to.contain(`public/${bundle.outputPath}`);
      expect(entries).to.contain(`public/${bundle.outputPath}.map`);
      expect(require(`${dir}/package.json`).browser).to.eql(main);
    });

    it('should compile lazyload modules without bundling', async function() {
      const { packet } = porter;
      const manifest = {};
      await packet.parseFile('lazyload.js');
      await packet.compile('lazyload.js', { manifest, loader: false, package: false });
      assert.ok(manifest['lazyload.js']);
      await assert.doesNotReject(async function() {
        await fs.access(path.join(root, `public/${manifest['lazyload.js']}`));
      });
    });

    it('should skip generating source map if bundle exists', async function() {
      const manifest = {};
      await porter.packet.compile('home.js', { manifest });
      const fpath = path.join(porter.output.path, manifest['home.js']);
      await assert.doesNotReject(async function() {
        await fs.access(fpath);
      });
      const stats = await fs.stat(fpath);
      await new Promise(resolve => setTimeout(resolve, 100));
      await porter.packet.compile('home.js', { manifest });
      const stats2 = await fs.stat(fpath);
      assert.equal(stats.mtime.getTime(), stats2.mtime.getTime());
    });
  });

  describe('packet.reload()', function() {
    it('should be able to handle cyclic dependencies', async function() {
      await porter.packet.reload('change', 'home.js');
    });
  });
});

describe('Packet with WebAssembly', function() {
  const root = path.resolve(__dirname, '../../../../examples/wasm');
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

  describe('packet.pack()', function() {
    it('should pack .wasm first', async function() {
      const packet = porter.packet.find({ name: '@cara/hello-wasm' });
      await packet.pack();
      assert.deepEqual(Object.keys(packet.bundles), [
        'pkg/bundler/index_bg.wasm',
        'index.js',
      ]);
    });
  });

  describe('packet.compileAll()', function() {
    it('should compile wasm as well', async function() {
      const packet = porter.packet.find({ name: '@cara/hello-wasm' });
      await packet.compileAll();
      const bundle = packet.bundles['pkg/bundler/index_bg.wasm'];
      const fpath = path.join(porter.output.path, bundle.outputPath);
      await assert.doesNotReject(async function() {
        await fs.access(fpath);
      });
      const { copy } = packet;
      assert.equal(copy.manifest['pkg/bundler/index_bg.wasm'], bundle.output);
    });
  });
});
