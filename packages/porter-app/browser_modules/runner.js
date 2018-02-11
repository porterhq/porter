'use strict'

// #1 mocha cannot be required directly yet.
// const mocha = require('mocha')
mocha.setup('bdd')
require('./require-directory/suite')
require('./cyclic-modules/suite')
require('./missing-dep/suite')
require('./require-uri/suite')
require('./conditional-require/suite')
mocha.run()
