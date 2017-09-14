'use strict'

const path = require('path')
const atImport = require('postcss-import')
const co = require('co')
const { exists } = require('mz/fs')

const findModule = require('./findModule')
const parseId = require('./parseId')


module.exports = function({ paths, dependenciesMap, system }) {
  function resolve(id, baseDir, importOptions) {
    if (id[0] == '.') {
      return path.join(baseDir, id)
    }

    const mod = parseId(id.slice(1), system)

    if (mod.name in system.modules) {
      return findModule(mod, dependenciesMap)
    } else {
      return co(function* () {
        for (const loadpath of importOptions.path) {
          const fpath = path.join(loadpath, id)
          if (yield exists(fpath)) return fpath
        }
      })
    }
  }

  return atImport({
    path: [ path.join(process.cwd(), 'node_modules') ].concat(paths),
    resolve
  })
}
