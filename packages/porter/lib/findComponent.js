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
 * @await {Array} [fpath, aliased]
 */
async function findComponent(id, paths) {
  for (const loadPath of paths) {
    let fpath = path.join(loadPath, id)

    if (await exists(fpath)) {
      return [fpath, false]
    }

    fpath = path.join(loadPath, id.replace(RE_EXT, '/index.$1'))

    if (await exists(fpath)) {
      return [fpath, true]
    }
  }

  if (id.endsWith('.js')) {
    return await findComponent(id.replace(RE_EXT, ''), paths)
  } else {
    return [null, false]
  }
}


module.exports = findComponent
