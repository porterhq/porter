import Worker from 'worker-loader!../worker.js';
import expect from 'expect.js';
import 'regenerator-runtime';

describe('demo-worker', function() {
  it('should work', function(done) {
    const worker = new Worker();
    worker.onmessage = function onMessage(event) {
      expect(event.data).to.eql('pong');
      done();
    };
    worker.postMessage('ping');
  });
});
