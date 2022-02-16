import expect from 'expect.js';
import init, { greet } from '@cara/hello-wasm/web';
import 'regenerator-runtime';

describe('demo-wasm (web)', function() {
  it('greet', async function() {
    const called = [];
    await init();
    global.alert = function alert(text) {
      called.push(text);
    };
    greet('wasm');
    expect(called).to.eql([ 'Hello, wasm!' ]);
  });
});
