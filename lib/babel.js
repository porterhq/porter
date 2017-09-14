'use strict'

let babel

try {
  babel = require('babel-core')
} catch (err) {
  // oceanify won't be able to require babel-core if oceanify is linked to another
  // directory. In that case, give $CWD/node_modules/babel-core a try.
  try {
    babel = require(`${process.cwd()}/node_modules/babel-core`)
  } catch (e) {}
}

module.exports = babel
