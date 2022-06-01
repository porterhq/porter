'use strict';

const { strict: assert } = require('assert');
const postcss = require('postcss');
const plugin = require('../../src/at_import');

async function run(input, output, opts = { }) {
  let result = await postcss([plugin(opts)]).process(input, { from: undefined });
  assert.equal(result.css, output);
  assert.equal(result.warnings().length, 0);
}

describe('test/unit/at_import.test.js', function() {
  it('should remove @import', async function() {
    await run('@import "./reset.css";body{margin:0}', 'body{margin:0}');
  });
});
