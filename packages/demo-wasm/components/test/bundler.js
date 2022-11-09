import { strict as assert } from 'assert';
import { greet } from '@cara/hello-wasm';

describe('demo-wasm (--target bundler)', function() {
  it('greet', async function() {
    const called = [];
    global.alert = function alert(text) {
      called.push(text);
    };
    greet('wasm');
    assert.deepEqual(called, [ 'Hello, wasm!' ]);
  });

  it('wasm file missing', async function() {
    const exports = await import('./missing_wasm');
    assert.equal(typeof exports.aloha, 'function');
    assert.throws(function() {
      exports.aloha('pacific');
    }, /TypeError/);
  });
});
