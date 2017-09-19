'use strict'

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
  const names = []

  function walk(map) {
    if (mod.name in map && (!mod.version || map[mod.name].version == mod.version)) {
      return Object.assign({ names, name: mod.name }, map[mod.name])
    }

    for (const name in map) {
      names.push(name)
      const result = walk(map[name].dependencies)
      if (result) return result
      names.pop()
    }
  }

  return walk(dependenciesMap)
}


module.exports = findModule
