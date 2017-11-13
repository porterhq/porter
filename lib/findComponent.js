'use strict'

/**
 * @module
 */

const path = require('path')

const { exists } = require('mz/fs')
const RE_EXT = /\.(\w+)$/

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

    fpath = path.join(loadPath, id.replace(RE_EXT, '/index.$1'))

    if (yield exists(fpath)) {
      return [fpath, true]
    }
  }

  if (id.endsWith('.js')) {
    return yield* findComponent(id.replace(RE_EXT, ''), paths)
  } else {
    return [null, false]
  }
}


module.exports = findComponent
