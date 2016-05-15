'use strict'

/**
 * @module
 */

const path = require('path')


/**
 * @module
 * Find the path of a module in the dependencies map.
 *
 * @param {Module} mod
 * @param {DependenciesMap} dependenciesMap
 *
 * @returns {string} fpath     The path to the specified module
 */
function findModule(mod, dependenciesMap) {
  var props = []

  function walk(map) {
    var name = mod.name

    if (name in map && map[name].version === mod.version) {
      return path.join(map[name].dir, mod.entry)
    }

    for (name in map) {
      props.push(name)
      var result = walk(map[name].dependencies)
      if (result) return result
      props.pop()
    }
  }

  return walk(dependenciesMap)
}


module.exports = findModule
