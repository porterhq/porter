'use strict'

const path = require('path')
const atImport = require('postcss-import')

const findComponent = require('./findComponent')
const findModule = require('./findModule')
const parseId = require('./parseId')


module.exports = function({ paths, dependenciesMap, system }) {
  function resolve(id, baseDir, importOptions) {
    if (id[0] == '.') {
      return path.join(baseDir, id)
    }

    const mod = parseId(id[0] == '/' ? id.slice(1) : id, system)

    if (mod.name in system.modules) {
      const { dir } = findModule(mod, dependenciesMap)
      return path.join(dir, mod.entry)
    } else {
      return findComponent(id, importOptions.path)
    }
  }

  return atImport({
    path: [ path.join(process.cwd(), 'node_modules') ].concat(paths),
    resolve
  })
}
