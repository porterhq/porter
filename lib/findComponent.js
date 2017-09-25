'use strict'

/**
 * @module
 */

const path = require('path')

const { exists } = require('mz/fs')



/**
 * Find the path of a component in mutiple base directories
 *
 * @param {string} id
 * @param {Array}  paths
 * @yield {Array} [fpath, aliased]
 */
function* findComponent(id, paths) {
  for (const loadPath of paths) {
    let fpath = path.join(loadPath, id)

    if (yield exists(fpath)) {
      return [fpath, false]
    }

    fpath = path.join(loadPath, id.replace(/\.(\w+)$/, '/index.$1'))

    if (yield exists(fpath)) {
      return [fpath, true]
    }
  }

  return [null, false]
}


module.exports = findComponent
