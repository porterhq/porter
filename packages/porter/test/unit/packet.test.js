'use strict';

const assert = require('assert').strict;
const path = require('path');
const expect = require('expect.js');
const { access, readFile } = require('fs').promises;
const semver = require('semver');
const exec = require('child_process').execSync;
const util = require('util');

const glob = util.promisify(require('glob'));

const Porter = require('../..');


describe('Packet', function() {
  const root = path.resolve(__dirname, '../../../demo-app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'test/suite.js', 'stylesheets/app.css'],
    });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  describe('packet.parseFile()', function() {
    it('parse into recursive dependencies map by traversing components', function() {
      expect(porter.package.name).to.be('@cara/demo-app');
      expect(porter.package.dependencies.yen.version).to.equal('1.2.4');
    });

    it('parse require directory in components', function() {
      expect(porter.package.folder).to.eql({
        'require-directory/math': true,
      });
    });

    it('parse require directory in node_modules', function() {
      expect(porter.package.dependencies.inferno.folder).to.eql({ 'dist': true });
    });

    it('parse require dir/ in node_modules', function() {
      // no need to track specifiers like require('lib/animations/transitions/')
      // because loader.js has that kind of specifiers covered already.
      expect(porter.package.dependencies['react-stack-grid'].folder).to.eql({});
    });

    if (process.platform == 'darwin' || process.platform == 'win32') {
      it('should warn if specifier is not fully resolved', async function() {
        this.sinon.spy(console, 'warn');
        await porter.package.parseFile('Home.js');
        assert(console.warn.calledWithMatch('case mismatch'));
      });
    }

    it('recognize css @import', function() {
      const cssFiles = Object.keys(porter.package.files).filter(file => file.endsWith('.css'));
      expect(cssFiles).to.eql([
        'stylesheets/app.css',
        'stylesheets/common/base.css',
        'stylesheets/common/reset.css'
      ]);
    });

    it('recognize browser field', function() {
      const stream = porter.package.find({ name: 'readable-stream' });
      const files = Object.keys(stream.files);
      expect(files).to.contain('lib/internal/streams/stream-browser.js');
      expect(files).to.contain('readable-browser.js');
      expect(files).to.not.contain('readable.js');
      expect(files).to.contain('errors-browser.js');
      expect(files).to.not.contain('errors.js');
    });

    it('disable module in browser field', function() {
      const iconv = porter.package.find({ name: 'iconv-lite' });
      expect(Object.keys(iconv.files)).to.not.contain('lib/extend-node');
      expect(Object.keys(iconv.files)).to.not.contain('lib/streams');
    });

    it('shim stream with readable-stream', function() {
      const iconv = porter.package.find({ name: 'iconv-lite' });
      expect(iconv.browser.stream).to.eql('readable-stream');
      expect('readable-stream' in iconv.dependencies).to.be.ok();

      const stream = porter.package.find({ name: 'readable-stream' });
      // shouldn't shim itself
      expect(Object.keys(stream.browser)).to.not.contain('readable-stream');
    });
  });

  describe('package.prepare()', function() {
    it('should recognize package.babel', async function() {
      const porter2 = new Porter({
        root: path.join(__dirname, '../fixtures/demo-package-babel'),
      });
      await porter2.ready;
      assert.equal(porter2.package.transpiler, 'babel');
      assert.deepEqual(porter.package.transpilerOpts.presets, [ '@babel/preset-env' ]);
    });

    it('should recognize .babelrc', async function() {
      assert.equal(porter.package.transpiler, 'babel');
      assert.deepEqual(porter.package.transpilerOpts.presets, [ '@babel/preset-env' ]);
    });

    it('should set transpiler for dependencies if enabled', async function() {
      const porter2 = new Porter({
        root,
        entries: [ 'home.js' ],
        transpile: {
          only: [ 'yen' ],
        },
      });
      await porter2.ready;
      const packet = porter2.package.find({ name: 'yen' });
      assert.equal(packet.transpiler, 'babel');
    });
  });

  describe('package.find()', function() {
    it('should find({ name, version })', function() {
      const name = 'yen';
      const version = '1.2.4';
      const pkg = porter.package.find({ name, version });
      expect(pkg.name).to.eql(name);
      expect(pkg.version).to.eql(version);
    });

    it('should find({ name })', function() {
      const pkg = porter.package.find({ name: 'react' });
      expect(pkg.name).to.eql('react');
    });
  });

  describe('package.findAll()', function() {
    it('should findAll({ name })', function() {
      const packages = porter.package.findAll({ name: 'react' });
      expect(packages[0].name).to.eql('react');
    });
  });

  describe('package.lock', function() {
    it('should flatten dependencies', function () {
      const pkg = require(path.join(root, 'package.json'));
      const { lock } = porter.package;
      expect(lock).to.be.an(Object);
      const deps = lock[pkg.name][pkg.version].dependencies;
      for (const name in deps) {
        expect(semver.satisfies(deps[name], pkg[name]));
      }
    });

    it('should contain @babel/runtime manifest', async function() {
      const { lock } = porter.package;
      assert.ok(lock['@babel/runtime']);
      // { manifest: { 'index.js': 'index.fc8964e4.js' } }
      const meta = Object.values(lock['@babel/runtime']).shift();
      assert.equal(Object.keys(meta.manifest).length, 1);
    });
  });

  describe('package.compile()', function () {
    before(async function() {
      exec('rm -rf ' + path.join(root, 'public'));
      await porter.ready;
    });

    it('should compile with package.compile(...entries)', async function () {
      const pkg = porter.package.find({ name: 'react' });
      const { name, version, main } = pkg;
      await pkg.compile(main);
      const bundle = pkg.bundles[main];
      const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root });
      expect(entries).to.contain(`public/${name}/${version}/${bundle.output}`);
      expect(entries).to.contain(`public/${name}/${version}/${bundle.output}.map`);
    });

    it('should generate source map of modules as well', async function() {
      const pkg = porter.package.find({ name: 'react' });
      const { name, version, main, } = pkg;
      await pkg.compile(main);
      const bundle = pkg.bundles[main];
      const fpath = path.join(root, 'public', `${name}/${version}/${bundle.output}.map`);
      const map = JSON.parse(await readFile(fpath, 'utf8'));
      expect(map.sources).to.contain('node_modules/react/index.js');
    });

    it('should compile package with different main entry', async function () {
      const pkg = porter.package.find({ name: 'chart.js' });
      const { name, version, main,  } = pkg;
      await pkg.compile(main);
      const bundle = pkg.bundles[main];
      const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root });
      expect(entries).to.contain(`public/${name}/${version}/${bundle.output}`);
      expect(entries).to.contain(`public/${name}/${version}/${bundle.output}.map`);
    });

    it('should compile entry with folder module', async function() {
      const pkg = porter.package.find({ name: 'react-datepicker' });
      const { name, version, main } = pkg;
      await pkg.compileAll();
      const bundle = pkg.bundles[main];
      const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root });
      expect(entries).to.contain(`public/${name}/${version}/${bundle.output}`);
      expect(entries).to.contain(`public/${name}/${version}/${bundle.output}.map`);
    });

    it('should compile entry with browser field', async function() {
      const pkg = porter.package.find({ name: 'cropper' });
      const { name, version, main, dir } = pkg;
      await pkg.compile(main);
      const bundle = pkg.bundles[main];
      const entries = await glob(`public/${name}/**/*.{css,js,map}`, { cwd: root });
      expect(entries).to.contain(`public/${name}/${version}/${bundle.output}`);
      expect(entries).to.contain(`public/${name}/${version}/${bundle.output}.map`);
      expect(require(`${dir}/package.json`).browser).to.eql(main);
    });

    it('should compile lazyload modules without bundling', async function() {
      const { package: pkg } = porter;
      const manifest = {};
      await pkg.parseFile('lazyload.js');
      await pkg.compile('lazyload.js', { manifest, loader: false, package: false });
      assert.ok(manifest['lazyload.js']);
      await assert.doesNotReject(async function() {
        await access(path.join(root, `public/${manifest['lazyload.js']}`));
      });
    });
  });

  describe('packet.reload()', function() {
    it('should be able to handle cyclic dependencies', async function() {
      await porter.package.reload('change', 'home.js');
    });
  });
});
