'use strict'

/**
 * @module
 */

const postcss = require('postcss')
const autoprefixer =  require('autoprefixer')
const atImport = require('postcss-import')
const path = require('path')

const fs = require('./fs')
const glob = require('./glob')
const mkdirp = require('./mkdirp')

const readFile = fs.readFile
const writeFile = fs.writeFile


/**
 * Compile stylesheets in components
 *
 * @param {Object}    opts
 * @param {string}    opts.dest
 * @param {string}    opts.match
 * @param {string[]}  opts.paths
 */
function* compileStyleSheets(opts) {
  opts = opts || {}
  const cwd = process.cwd()
  const paths = [].concat(opts.paths || 'components').map(function(dir) {
    return path.resolve(cwd, dir)
  })
  const dest = path.resolve(cwd, opts.dest || 'public')
  const match = opts.match || '{main,main/**/*}.css'

  const processor = postcss()
    .use(autoprefixer())
    .use(atImport({
      path: [ path.join(process.cwd(), 'node_modules') ].concat(paths)
    }))

  for (let i = 0; i < paths.length; i++) {
    const currentPath = paths[i]
    const entries = yield glob(path.join(currentPath, match))

    for (let j = 0; j < entries.length; j++) {
      yield* compileStyleSheet(processor, {
        cwd,
        dest,
        id: path.relative(currentPath, entries[j]),
        path: currentPath
      })
    }
  }
}


/**
 * Compile stylesheet in components
 *
 * @param {Object} processor
 * @param {Object} opts
 * @param {string} opts.cwd
 * @param {string} opts.dest
 * @param {string} opts.id
 * @param {string} opts.path
 */
function* compileStyleSheet(processor, opts) {
  const { cwd, path: currentPath, dest, id } = opts

  const destPath = path.join(dest, id)
  const fpath = path.join(currentPath, id)
  const source = yield readFile(fpath, 'utf8')

  const result = yield processor.process(source, {
      from: path.relative(cwd, fpath),
      to: id,
      map: { inline: false }
    })

  yield mkdirp(path.dirname(destPath))
  yield [
    writeFile(destPath, result.css),
    writeFile(destPath + '.map', result.map)
  ]
}


module.exports = compileStyleSheets
