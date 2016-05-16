'use strict'

/**
 * @module
 */

const path = require('path')

const exists = require('./fs').exists



/**
 * Find the path of a component in mutiple base directories
 *
 * @param {string} id
 * @param {Array}  bases
 * @yield {string} path of the component found
 */
function* findComponent(id, bases) {
  for (let i = 0; i < bases.length; i++) {
    let componentPath = path.join(bases[i], id)
    if (yield exists(componentPath)) {
      return componentPath
    }
  }
}


module.exports = findComponent
