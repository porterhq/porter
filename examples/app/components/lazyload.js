'use strict';

const path = require('path');
const $ = require('yen');
require('./lazyload_dep');

console.log('lazyload', path.join('foo', 'bar'), $);
