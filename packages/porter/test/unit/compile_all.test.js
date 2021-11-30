'use strict';

const path = require('path');
const { strict: assert } = require('assert');
const util = require('util');
const fs = require('fs/promises');
const glob = util.promisify(require('glob'));

const Porter = require('../..');
const { readFile } = fs;

describe('porter.compileAll()', function() {
  // compiling without cache could be time consuming
  this.timeout(600000);
  const root = path.resolve(__dirname, '../../../demo-app');
  const dest = path.join(root, 'public');
  let porter;
  let entries;
  let manifest;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      preload: 'preload',
      lazyload: ['lazyload.js'],
      source: { root: 'http://localhost:3000/' }
    });
    await fs.rm(porter.cache.dest, { recursive: true, force: true });
    await porter.ready;

    await porter.compileAll({
      entries: ['home.js', 'test/suite.js', 'stylesheets/app.css']
    });
    entries = await glob('public/**/*.{css,js,map}', { cwd: root });
    const fpath = path.join(root, 'manifest.json');
    await assert.doesNotReject(async function() {
      await fs.access(fpath);
    });
    manifest = require(fpath);
  });

  after(async function() {
    await porter.destroy();
  });

  it('should rename entries with contenthash', async function() {
    assert(manifest['home.js']);
    assert(manifest['test/suite.js']);
    assert(manifest['stylesheets/app.css']);
    assert(manifest['lazyload.js']);
  });

  it('should compile entries with same-package dependencies bundled', async function () {
    const fpath = path.join(dest, manifest['home.js']);
    const content = await readFile(fpath, 'utf8');
    assert(content.includes('define("home_dep.js",'));
    assert(content.includes('porter.lock'));
  });

  it('should compile entries in all paths', async function () {
    assert(entries.includes(`public/${manifest['test/suite.js']}`));
    assert(entries.includes(`public/${manifest['test/suite.js']}.map`));
  });

  it('should compile lazyload files', async function () {
    assert(entries.includes(`public/${manifest['lazyload.js']}`));
  });

  it('should generate source map of entries', async function() {
    const fpath = path.join(dest, `${manifest['home.js']}.map`);
    const map = JSON.parse(await readFile(fpath, 'utf8'));
    assert(map.sources.includes('components/home.js'));
    assert(map.sources.includes('components/home_dep.js'));
  });

  it('should generate source map of components from other paths', async function() {
    const fpath = path.join(dest, `${manifest['test/suite.js']}.map`);
    const map = JSON.parse(await readFile(fpath, 'utf8'));
    assert(map.sources.includes('browser_modules/test/suite.js'));
    assert(map.sources.includes('browser_modules/require-directory/convert/index.js'));
  });

  it('should set sourceRoot in components source map', async function() {
    const fpath = path.join(dest, `${manifest['home.js']}.map`);
    const map = JSON.parse(await readFile(fpath, 'utf8'));
    assert.equal(map.sourceRoot, 'http://localhost:3000/');
  });

  it('should set sourceRoot in related dependencies too', async function() {
    const fpath = path.join(dest, `${manifest['home.js']}.map`);
    const map = JSON.parse(await readFile(fpath, 'utf8'));
    assert.equal(map.sourceRoot, 'http://localhost:3000/');
  });

  it('should compile stylesheets', async function() {
    assert(entries.includes(`public/${manifest['stylesheets/app.css']}`));
    const fpath = path.join(dest, `${manifest['stylesheets/app.css']}`);
    const content = await readFile(fpath, 'utf-8');
    assert.ok(content.includes('font-family:'));
    assert.ok(content.includes(`/*# sourceMappingURL=${path.basename(fpath)}.map */`));
  });
});
