'use strict';

const { strict: assert } = require('assert');
const path = require('path');
// const fs = require('fs/promises');
const Porter = require('../..').default;
const { SourceMapConsumer } = require('source-map');

describe('TsModule', function() {
  const root = path.resolve(__dirname, '../../../../examples/typescript');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      entries: [ 'app.tsx' ],
      cache: { clean: true },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('module.load()', function() {
    it('need to neglect type imports in advance', async function() {
      const mod = porter.packet.files['app.tsx'];
      assert.deepEqual(mod.dynamicImports, ['./utils/math']);
      assert.deepEqual(mod.imports, ['react', 'react-dom', 'prismjs', 'lodash', './home']);
    });

    it('should return loaded source rather than the traspiled one', async function() {
      const mod = porter.packet.files['app.tsx'];
      const result = await mod.load();
      assert(result.code.includes('import React'));
    });
  });

  describe('module.transpile()', async function() {
    it('should generate correct source mappings', async function() {
      const mod = porter.packet.files['app.tsx'];
      const result = await mod.transpile(await mod.load());
      await SourceMapConsumer.with(JSON.stringify(result.map), null, async consumer => {
        // ReactDOM.render(<App />, document.querySelector('#ReactApp'));
        const mapping = consumer.generatedPositionFor({
          source: 'porter:///components/app.tsx',
          line: 34,
          column: 0,
        });
        const line = result.code.split('\n')[mapping.line - 1];
        assert.ok(line);
        assert.ok(line.includes("document.querySelector('#ReactApp')"));
      });
    });
  });
});
