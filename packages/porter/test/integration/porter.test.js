'use strict';

const { strict: assert } = require('assert');
const Koa = require('koa');
const path = require('path');
const request = require('supertest');
const { existsSync, promises: fs } = require('fs');

const { readFile, writeFile } = fs;

const Porter = require('../..');
const root = path.resolve(__dirname, '../../../demo-app');

let app;
let porter;

function requestPath(urlPath, status = 200, listener = app.callback()) {
  return new Promise(function(resolve, reject) {
    request(listener)
      .get(urlPath)
      .expect(status)
      .end(function(err, res) {
        if (err) reject(err);
        else resolve(res);
      });
  });
}

async function checkReload({ sourceFile, targetFile, pathname }) {
  sourceFile = sourceFile || targetFile;
  const sourceModule = await porter.package.parseFile(sourceFile);
  const targetModule = await porter.package.parseEntry(targetFile);
  await porter.pack();
  pathname = pathname || `/${targetModule.id}`;

  const { fpath: sourcePath } = sourceModule;
  const bundle = porter.package.bundles[pathname.slice(1)];
  let cachePath = path.join(porter.cache.dest, bundle.outputPath);

  const source = await readFile(sourcePath, 'utf8');
  const mark = `/* changed ${Date.now().toString(36)} */`;
  await writeFile(sourcePath, `${source}${mark}`);

  try {
    // {@link Package#watch} takes time to reload
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      // https://stackoverflow.com/questions/10468504/why-fs-watchfile-called-twice-in-node
      // recursive option not supported on linux platform, reload again to make sure test passes.
      await porter.package.reload('change', sourceFile);
    }

    assert(!existsSync(cachePath));
    await requestPath(pathname);
    cachePath = path.join(porter.cache.dest, bundle.outputPath);
    assert(existsSync(cachePath));
    assert((await readFile(cachePath, 'utf8')).includes(mark));
  } finally {
    await writeFile(sourcePath, source);
  }
}

describe('Porter', function() {
  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      source: {
        serve: true,
        root: 'http://localhost:5000'
      }
    });
    await fs.rm(porter.cache.dest, { recursive: true, force: true });
    await porter.ready;

    app = new Koa();
    app.use(porter.async());
    app.use(async function(ctx, next) {
      if (ctx.path == '/arbitrary-path') {
        ctx.body = 'It works!';
      }
    });
  });

  after(async function() {
    await porter.destroy();
  });

  describe('Porter_readFile()', function() {
    it('should start from main', async function () {
      const res = await requestPath('/home.js?main');
      assert(res.text.includes('define("home.js"'));
      assert(res.text.includes('porter["import"]("home.js")'));
    });

    it('should handle components', async function () {
      const { name, version } = porter.package;
      await requestPath(`/${name}/${version}/home.js`);
      await requestPath(`/${name}/home.js`, 404);
      await requestPath('/home.js');
    });

    it('should bundle relative dependencies of components', async function() {
      const res = await requestPath('/home.js?main');
      assert(res.text.includes('define("home_dep.js"'));
    });

    it('should bundle json components', async function() {
      const res = await requestPath('/test/suite.js?main');
      assert(res.text.includes('define("require-json/foo.json"'));
    });

    it('should handle dependencies', async function () {
      const { name, version, bundle } = porter.package.find({ name: 'yen' });
      await requestPath(`/${name}/${version}/${bundle.entry}`);
    });

    it('should handle recursive dependencies', async function () {
      // object-assign isn't in system's dependencies
      const { name, version, bundle } = porter.package.find({ name: 'object-assign' });
      await requestPath(`/${name}/${version}/${bundle.entry}`);
    });

    it('should handle stylesheets', async function () {
      const { name, version } = porter.package;
      await requestPath(`/${name}/${version}/stylesheets/app.css`);
      await requestPath('/stylesheets/app.css');
    });

    it('should serve raw assets too', async function () {
      await requestPath('/raw/logo.jpg');
    });

    it('should handle package manifest', async function() {
      const yen = porter.package.find({ name: 'yen' });
      const { name, version, main } = yen;
      const { manifest } = porter.package.lock[name][version];
      await requestPath(`/${name}/${version}/${manifest[main]}`);
    });

    it('should hand request over to next middleware', async function() {
      await requestPath('/arbitrary-path');
    });
  });

  describe('.func()', function() {
    it('should work with express app', async function() {
      const express = require('express');
      const listener = express().use(porter.func());
      const { name, version } = porter.package;
      await requestPath(`/${name}/${version}/home.js`, 200, listener);
    });
  });

  describe('{ cache }', function() {
    it('should cache generated style', async function () {
      const { name, version } = porter.package;
      await requestPath(`/${name}/${version}/stylesheets/app.css`);

      const { cache } = porter.package.files['stylesheets/app.css'];
      assert(!cache.code.includes('@import'));
    });

    it('should invalidate generated style if source changed', async function () {
      await checkReload({
        sourceFile: 'stylesheets/common/base.css',
        targetFile: 'stylesheets/app.css'
      });
    });

    it('should invalidate generated js if source changed', async function() {
      await checkReload({ targetFile: 'home.js' });
    });

    it('should invalidate generated js if dependencies changed', async function() {
      await checkReload({
        sourceFile: 'home_dep.js',
        targetFile: 'home.js'
      });
    });

    // GET /home.js?main
    it('should invalidate generated js of shortcut components', async function() {
      await checkReload({
        sourceFile: 'home_dep.js',
        targetFile: 'home.js',
        pathname: '/home.js'
      });
    });
  });

  describe('{ source }', function() {
    it('should serve the source of loader.js', async function () {
      await requestPath('/loader.js');
    });

    it('should serve components source', async function () {
      await requestPath('/components/home.js');
    });

    it('should serve dependencies source', async function () {
      await requestPath('/node_modules/yen/index.js');
    });

    it('should not serve source by default', async function () {
      const porter2 = new Porter({ root });
      const listener = new Koa().use(porter2.async()).callback();
      await requestPath('/components/home.js', 404, listener);
      await porter2.destroy();
    });
  });

  describe('Source Map in Porter_readFile()', function() {
    beforeEach(async function() {
      await fs.rm(path.join(root, 'public'), { recursive: true, force: true });
      await porter.package.parseEntry('home.js');
      await porter.package.pack();
    });

    it('should set sourceMappingURL accordingly', async function() {
      const res = await requestPath('/home.js', 200);
      const bundle = porter.package.bundles['home.js'];
      const fname = path.basename(bundle.output);
      assert.equal(res.text.split('\n').pop(), `//# sourceMappingURL=${fname}.map`);
    });

    it('should generate source map when accessing bundle', async function() {
      await requestPath('/home.js', 200);
      const bundle = porter.package.bundles['home.js'];
      const fpath = path.join(root, `public/${bundle.output}.map`);
      assert(existsSync(fpath));

      const map = JSON.parse(await readFile(fpath, 'utf8'));
      assert(map.sources.includes('components/home.js'));
    });

    it('should generate source map when accessing /${file}', async function() {
      await requestPath('/home.js', 200);
      const bundle = porter.package.bundles['home.js'];
      const fpath = path.join(root, `public/${bundle.output}.map`);
      assert(existsSync(fpath));

      const map = JSON.parse(await readFile(fpath, 'utf8'));
      assert(map.sources.includes('components/home.js'));
    });

    it('should generate source map when accessing ${file}?main', async function() {
      await requestPath('/home.js?main', 200);
      const bundle = porter.package.bundles['home.js'];
      const fpath = path.join(root, `public/${bundle.output}.map`);
      assert(existsSync(fpath));

      const map = JSON.parse(await readFile(fpath, 'utf8'));
      assert(map.sources.includes('components/home.js'));
      assert(map.sources.includes('loader.js'));
    });

    it('should generate source map when accessing dependencies', async function() {
      const { name, version, bundle } = porter.package.find({ name: 'react' });;
      await requestPath(`/${name}/${version}/${bundle.entry}`, 200);
      const fpath = path.join(root, `public/${name}/${version}/${bundle.output}.map`);
      assert(existsSync(fpath));

      const map = JSON.parse(await readFile(fpath, 'utf8'));
      assert(map.sources.includes('node_modules/react/index.js'));
      assert(map.sources.includes('node_modules/react/cjs/react.development.js'));
    });
  });
});
