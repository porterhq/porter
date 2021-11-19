'use strict';

const Worker = require('worker-loader!./components/worker.js');

const worker= new Worker();

module.exports = function greeting() {
  return new Promise(function(resolve) {
    worker.onmessage = function(message) {
      resolve(message.data);
    };
    worker.postMessage('ping');
  });
};
