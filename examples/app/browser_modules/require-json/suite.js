'use strict';

const { strict: assert } = require('assert');

describe('require json', function() {
  it('require("./foo.json")', function() {
    assert.deepEqual(require('./foo.json'), {
      foo: 1,
      bar: true
    });
  });

  it('require("yen/package.json")', function() {
    const { name } = require('yen/package.json');
    assert.equal(name, 'yen');
  });

  it('require("./foo bar.json")', function() {
    assert.deepEqual(require('./foo bar.json'), {
      foo: 2,
      bar: false,
    });
  });

  it('require("./测试数据 2.json")', function() {
    assert.deepEqual(require('./测试数据 2.json'), {
      version: 1,
      data: [
        { foo: 1 },
      ],
    });
  });

  it('require("./\\u6d4b\\u8bd5\\u6570\\u636e 3.json)', function() {
    assert.deepEqual(require('./\u6d4b\u8bd5\u6570\u636e 3.json'), {
      version: 2,
      data: [
        { foo: 3 },
      ],
    });
  });

  it('import("./测试数据 4.json', async function() {
    assert.deepEqual((await import('./测试数据 4.json')).default, {
      version: 3,
      data: [
        { foo: 4 },
      ],
    });
  });
});
