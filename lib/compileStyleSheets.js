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
 * @param {string}    opts.root
 */
function* compileStyleSheets(opts) {
  opts = opts || {}
  const root = opts.root || process.cwd()
  const paths = [].concat(opts.paths || 'components').map(function(dir) {
    return path.resolve(root, dir)
  })
  const pkg = require(path.join(root, 'package.json'))
  const dest = path.resolve(root, opts.dest || 'public', pkg.name, pkg.version)
  const match = opts.match || '{main,main/**/*}.css'

  const processor = postcss()
    .use(atImport({
      path: [ path.join(process.cwd(), 'node_modules') ].concat(paths)
    }))
    .use(autoprefixer())

  for (let i = 0; i < paths.length; i++) {
    const currentPath = paths[i]
    const entries = yield glob(path.join(currentPath, match))

    for (let j = 0; j < entries.length; j++) {
      const entry = path.relative(currentPath, entries[j])

      try {
        yield* compileStyleSheet(processor, {
          root,
          dest,
          entry,
          path: currentPath
        })
      } catch (err) {
        if (err instanceof SyntaxError) {
          console.error(err.stack)
        } else {
          // the original err.stack does not give anything useful yet.
          throw new Error(`Failed to compile ${entry}`)
        }
      }
    }
  }
}


/**
 * Compile stylesheet in components
 *
 * @param {Object} processor
 * @param {Object} opts
 * @param {string} opts.dest
 * @param {string} opts.entry
 * @param {string} opts.path
 * @param {string} opts.root
 */
function* compileStyleSheet(processor, opts) {
  const { root, path: currentPath, dest, entry } = opts

  const destPath = path.join(dest, entry)
  const fpath = path.join(currentPath, entry)
  const source = yield readFile(fpath, 'utf8')

  const result = yield processor.process(source, {
    from: path.relative(root, fpath),
    to: entry,
    map: { inline: false, sourcesContent: false }
  })

  yield mkdirp(path.dirname(destPath))
  yield [
    writeFile(destPath, result.css),
    writeFile(destPath + '.map', result.map)
  ]
}


module.exports = compileStyleSheets
