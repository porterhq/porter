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

    if (data.dependencies && Object.keys(data.dependencies).length > 0) {
      version.dependencies = flat(data.dependencies)
    }

    if (data.alias && Object.keys(data.alias).length > 0)  {
      version.alias = data.alias
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
 * @param   {DependenciesMap} dependenciesMap
 *
 * @returns {System}          system
 */
function parseSystem(dependenciesMap) {
  const modules = parseModules(dependenciesMap)
  const system = {}

  for (const name in dependenciesMap) {
    const { version, main } = dependenciesMap[name]
    Object.assign(system, {
      name, version,
      main: main ? main.replace(/\.js$/, '') : 'index',
      modules
    })
  }

  return system
}


module.exports = parseSystem
