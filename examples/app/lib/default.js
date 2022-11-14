'use strict';

const path = require('path');
const Porter = require('@cara/porter');

module.exports = new Porter({
  root: path.join(__dirname, '..'),
  paths: ['components', 'browser_modules'],
  source: {
    serve: true,
    root: 'http://localhost:5000'
  }
});
