'use strict'

/**
 * @module
 */

const postcss = require('postcss')
const autoprefixer =  require('autoprefixer')
const path = require('path')
const fs = require('mz/fs')

const glob = require('./glob')
const mkdirp = require('./mkdirp')
const parseMap = require('./parseMap')
const parseSystem = require('./parseSystem')
const atImport = require('./atImport')

const { readFile, writeFile } = fs

/**
 * Compile stylesheets in components
 *
 * @param {Object}    opts
 * @param {string}    opts.dest
 * @param {string}    opts.match
 * @param {string[]}  opts.paths
 * @param {string}    opts.root
 */
async function compileStyleSheets(opts) {
  opts = opts || {}
  const root = opts.root || process.cwd()
  const paths = [].concat(opts.paths || 'components').map(function(dir) {
    return path.resolve(root, dir)
  })
  const pkg = require(path.join(root, 'package.json'))
  const dest = path.resolve(root, opts.dest || 'public', pkg.name, pkg.version)
  const match = opts.match || '{main,main/**/*}.css'

  const dependenciesMap = await parseMap({ root, paths })
  const system = parseSystem(dependenciesMap)

  const processor = postcss()
    .use(atImport({ paths, dependenciesMap, system }))
    .use(autoprefixer())

  for (let i = 0; i < paths.length; i++) {
    const currentPath = paths[i]
    const entries = await glob(path.join(currentPath, match))

    for (let j = 0; j < entries.length; j++) {
      const entry = path.relative(currentPath, entries[j])

      try {
        await compileStyleSheet(processor, {
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
async function compileStyleSheet(processor, opts) {
  const { root, path: currentPath, dest, entry } = opts

  const destPath = path.join(dest, entry)
  const fpath = path.join(currentPath, entry)
  const source = await readFile(fpath, 'utf8')

  const result = await processor.process(source, {
    from: path.relative(root, fpath),
    to: path.relative(root, destPath),
    map: { inline: false, sourcesContent: false }
  })

  await mkdirp(path.dirname(destPath))
  await Promise.all([
    writeFile(destPath, result.css),
    writeFile(destPath + '.map', result.map)
  ])
}


module.exports = compileStyleSheets
