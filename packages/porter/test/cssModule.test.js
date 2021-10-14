'use strict'

const path = require('path')
const assert = require('assert').strict;
const postcssPresetEnv = require('postcss-preset-env')
// locked to v1.2.0
// - https://github.com/leodido/postcss-clean/issues/63
const clean = require('postcss-clean')
const Porter = require('..')

const root = path.resolve(__dirname, '../../demo-app')
const porter = new Porter({
  root,
  paths: ['components', 'browser_modules'],
  entries: ['home.js', 'stylesheets/app.css'],
  postcssPlugins: [
    postcssPresetEnv(),
    clean()
  ]
})

describe('CssModule', function() {
  beforeEach(async function() {
    await porter.ready
  })

  it('should be able to transpile css module', async function() {
    const mod = porter.package.files['stylesheets/app.css']
    const result = await mod.load()
    await assert.doesNotReject(async function() {
      await mod.transpile(result)
    })
  })
})
