'use strict'

// #1 mocha cannot be required directly yet.
// const mocha = require('mocha')
mocha.setup('bdd')
require('./require-directory/suite')
require('./cyclic-modules/suite')
mocha.run()
