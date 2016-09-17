'use strict'

/**
 * @module
 */


function flat(deps) {
  return Object.keys(deps).reduce(function(result, name) {
    result[name] = deps[name].version
    return result
  }, {})
}


function parseModules(dependenciesMap) {
  const modules = {}
  const dependencyPath = []

  function alias(name, data) {
    const versions = modules[name] || (modules[name] = {})
    const version = versions[data.version] = {}

    if (!/^(?:\.\/)?index(?:.js)?$/.test(data.main)) {
      version.main = data.main
    }
    if (data.dependencies && Object.keys(data.dependencies).length) {
      version.dependencies = flat(data.dependencies)
    }
    dependencyPath.push(name)
    walk(data.dependencies)
    dependencyPath.pop()
  }

  function walk(deps) {
    for (const name in deps) {
      alias(name, deps[name])
    }
  }

  walk(dependenciesMap)
  return modules
}


/**
 * Flatten result into a two level object. #6
 *
 * @param   {string}          name
 * @param   {string}          version
 * @param   {DependenciesMap} dependenciesMap
 *
 * @returns {System}          system
 */
function parseSystem({ name, version, main }, dependenciesMap) {
  const modules = parseModules(dependenciesMap)

  modules[name] = {
    [version]: { dependencies: flat(dependenciesMap) }
  }

  return {
    name,
    version,
    main: (main || 'index.js').replace(/\.js$/, ''),
    modules
  }
}


module.exports = parseSystem
