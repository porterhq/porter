const Worker = require('worker-loader!./worker.js');

const worker= new Worker();
worker.onmessage = function(message) {
  console.log(message);
};
worker.postMessage('ping');
