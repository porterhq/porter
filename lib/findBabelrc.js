
'use strict'

const path = require('path')
const { exists } = require('mz/fs')

const dirHasBabelrc = {}

async function findBabelrc(fpath, { root }) {
  let dir = path.dirname(fpath)

  if (!dirHasBabelrc[dir]) {
    while (dir.startsWith(root)) {
      let babelrcPath = path.join(dir, '.babelrc')
      if (await exists(babelrcPath)) {
        dirHasBabelrc[dir] = babelrcPath
        break
      }
      dir = path.dirname(dir)
    }
  }

  return dirHasBabelrc[dir]
}

module.exports = findBabelrc
