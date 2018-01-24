'use strict'

/**
 * Node.js supports require('lib') as a shortcut of require('lib/index'),
 * let's see if we can support it too.
 */
const { foo } = require('./foo')

exports.foo = foo
