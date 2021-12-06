'use strict';

const path = require('path');
require('./lazyload_dep');

console.log('lazyload', path.join('foo', 'bar'));
