import expect from 'expect.js';
import init, { greet } from '@cara/hello-wasm';
import 'regenerator-runtime';

describe('demo-wasm', function() {
  it('greet', async function() {
    const called = [];
    global.alert = function alert(text) {
      called.push(text);
    };
    await init();
    greet('wasm');
    expect(called).to.eql([ 'Hello, wasm' ]);
  });
});
