'use strict'

// #1 mocha cannot be required directly yet.
// const mocha = require('mocha')
require('../require-directory/suite')
require('../cyclic-modules/suite')
require('../missing-dep/suite')
require('../require-uri/suite')
require('../conditional-require/suite')