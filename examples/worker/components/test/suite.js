import Worker from 'worker-loader!../worker.js';
import HelloWorker from '@cara/hello-worker';
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

  it('should support workers in dependencies', function(done) {
    const worker = new HelloWorker();
    worker.onmessage = function onMessage(event) {
      expect(event.data).to.eql('matata');
      done();
    };
    worker.postMessage('hakuna');
  });
});
