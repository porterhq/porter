'use strict';

const path = require('path');
const assert = require('assert').strict;
const postcssPresetEnv = require('postcss-preset-env');
const cssnano = require('cssnano');
const fs = require('fs/promises');

const Porter = require('../..');
const { MODULE_LOADED } = require('../../src/constants');

describe('CssModule', function() {
  const root = path.resolve(__dirname, '../../../demo-app');
  const cwd = process.cwd();
  let porter;

  before(async function() {
    // change directory into packages/demo-app to have postcss resolve paths correctly
    process.chdir(root);
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'stylesheets/app.css'],
      postcssPlugins: [
        postcssPresetEnv(),
        cssnano(),
      ],
    });
    await fs.rm(porter.cache.dest, { recursive: true, force: true });
    await porter.ready;
  });

  after(async function() {
    process.chdir(cwd);
    await porter.destroy();
  });

  it('should transpile css module', async function() {
    const mod = porter.package.files['stylesheets/app.css'];
    const result = await mod.load();
    await assert.doesNotReject(async function() {
      await mod.transpile(result);
    });
  });

  it('should transpile with correct source map', async function() {
    const mod = porter.package.files['stylesheets/app.css'];
    const { map } = await mod.obtain();
    assert.deepEqual(map.sources, [
      'components/stylesheets/common/reset.css',
      'components/stylesheets/common/base.css',
      'node_modules/cropper/dist/cropper.css',
      'node_modules/prismjs/themes/prism.css',
      'components/stylesheets/app.css',
    ]);
  });

  it('should set status to MODULE_LOADED after parse', async function() {
    const mod = porter.package.files['stylesheets/app.css'];
    assert.equal(mod.status, MODULE_LOADED);
  });
});
