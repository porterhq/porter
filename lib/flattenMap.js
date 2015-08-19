'use strict'

/*
 * Flatten result into a two level object. #6
 */
function flattenMap(dependencies) {
  var modules = {}
  var dependencyPath = []

  function flat(deps) {
    return Object.keys(deps).reduce(function(result, name) {
      result[name] = deps[name].version
      return result
    }, {})
  }

  function alias(name, data) {
    var versions = modules[name] || (modules[name] = {})
    var version = versions[data.version] = {}

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
    for (var name in deps) {
      alias(name, deps[name])
    }
  }

  walk(dependencies)

  return {
    modules: modules,
    dependencies: flat(dependencies)
  }
}


module.exports = flattenMap
