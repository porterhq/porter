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


function* compileStyleSheets(opts) {
  opts = opts || {}
  var cwd = process.cwd()
  var base = path.resolve(cwd, opts.base || 'components')
  var dest = path.resolve(cwd, opts.dest || 'public')
  var match = opts.match || '{main,main/**/*}.css'

  var entries = yield glob(path.join(base, match))

  for (var i = 0, len = entries.length; i < len; i++) {
    yield* compileStyleSheet({
      cwd: cwd,
      base: base,
      dest: dest,
      fpath: entries[i],
    })
  }
}


const processor = postcss()
  .use(autoprefixer())
  .use(atImport({
    path: [ path.join(process.cwd(), 'node_modules') ]
  }))

/**
 * Compile styles in components
 *
 * @param {Object} opts
 * @param {string} opts.root
 * @param {string} opts.base
 * @param {string} opts.dest
 */
function* compileStyleSheet(opts) {
  var cwd = process.cwd()
  var base = opts.base
  var dest = opts.dest
  var fpath = opts.fpath

  var destPath = path.join(dest, path.relative(base, fpath))
  var source = yield readFile(fpath)

  var result = yield processor.process(source, {
      from: path.relative(cwd, fpath),
      to: path.relative(base, fpath),
      map: { inline: false }
    })

  yield mkdirp(path.dirname(destPath))
  yield [
    writeFile(destPath, result.css),
    writeFile(destPath + '.map', result.map)
  ]
}


module.exports = compileStyleSheets
