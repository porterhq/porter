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
 * @param {Array}  paths
 * @yield {string} path of the component found
 */
function* findComponent(id, paths) {
  for (let i = 0; i < paths.length; i++) {
    let componentPath = path.join(paths[i], id)
    if (yield exists(componentPath)) {
      return componentPath
    }
  }
}


module.exports = findComponent
