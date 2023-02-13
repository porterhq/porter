'use strict';

const assert = require('assert').strict;
const path = require('path');
const Cache = require('../../src/cache').default;

const root = path.join(__dirname, '../../../../examples/app');

describe('test/unit/cache.test.js', function() {
  const packet = {
    transpiler: 'babel',
    transpilerVersion: '7.16.10',
    transpilerOpts: {
      presets: ['@babel/preset-env'],
      plugins: [
        '@babel/plugin-transform-runtime',
        require.resolve('../../src/babel_plugin.js'),
      ],
    },
  };
  let cache;

  before(async function() {
    cache = new Cache({ path: path.join(root, '.porter-cache') });
    await cache.prepare({ packet });
  });

  describe('.identifier({ packet })', async function() {
    it('should include both tooling version and options', async function() {
      assert.equal(typeof cache.salt, 'string');
      const data = JSON.parse(cache.salt);
      assert.equal(data.version, require('../../package.json').version);
      assert.equal(data.transpiler.name, 'babel');
    });

    it('should not be interfered by package path', async function() {
      const packet2 = JSON.parse(JSON.stringify(packet));
      packet2.transpilerOpts.plugins[1] = '<porterDir>/src/babel_plugin.js';
      assert.equal(cache.salt, cache.identifier({ packet: packet2 }));
    });

    it('should take uglifyOptions into consideration', async function() {
      const uglifyOptions = { compress: { drop_console: true } };
      assert.notEqual(cache.salt, cache.identifier({ packet, uglifyOptions }));
    });
  });

  describe('.get(key, source)', async function() {
    beforeEach(async function() {
      await cache.remove('foo.js');
    });

    it('should return empty if cache not found', async function() {
      const result = await cache.get('foo.js', 'const a = () => {}');
      assert.equal(result, undefined);
    });

    it('should return cache if persisted before', async function() {
      await cache.set('foo.js', 'const a = () => {}', {
        code: 'function a() {}',
      });
      const result = await cache.get('foo.js', 'const a = () => {}');
      assert.notEqual(result, undefined);
      assert.equal(result.code, 'function a() {}');
      assert.ok(result.digest);
    });

    it('should skip staled cache', async function() {
      await cache.set('foo.js', 'const a = () => {}', {
        code: 'function a() {}',
      });
      // source content changed
      const result = await cache.get('foo.js', 'const b = () => {}');
      assert.equal(result, undefined);
    });
  });
});
