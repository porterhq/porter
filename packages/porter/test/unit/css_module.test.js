'use strict';

const path = require('path');
const assert = require('assert').strict;
const postcssPresetEnv = require('postcss-preset-env');
// locked to v1.2.0
// - https://github.com/leodido/postcss-clean/issues/63
const clean = require('postcss-clean');
const Porter = require('../..');


describe('CssModule', function() {
  const root = path.resolve(__dirname, '../../../demo-app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'stylesheets/app.css'],
      postcssPlugins: [
        postcssPresetEnv(),
        clean()
      ]
    });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  it('should transpile css module', async function() {
    const mod = porter.package.files['stylesheets/app.css'];
    const result = await mod.load();
    await assert.doesNotReject(async function() {
      await mod.transpile(result);
    });
  });
});
