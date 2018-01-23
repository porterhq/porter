'use strict'

/**
 * @module
 */

const path = require('path')
const format = require('util').format
const fs = require('mz/fs')
// const debug = require('debug')('porter')

const glob = require('./glob')
const matchRequire = require('./matchRequire')
const findComponent = require('./findComponent')
const findModule = require('./findModule')

const { readFile, exists, lstat } = fs

const RE_EXT = /\.js$/
const RE_NAME_ENTRY = /^((?:@[^\/]+\/)?[^\/]+)(?:\/(.*))?$/
const RE_URI = /^(?:https?:)?\/\//


/**
 * Traversing path to find the node_modules directory that contain ${name}
 *
 * @param {string} root
 * @param {string} name
 */
async function closest(root, name) {
  const fpath = path.join(root, 'node_modules', name)

  if (await exists(fpath)) {
    return fpath
  } else if (root.indexOf('/node_modules/') > 0) {
    while (path.basename(root) !== 'node_modules') {
      root = path.resolve(root, '..')
    }
    return await closest(path.resolve(root, '..'), name)
  } else {
    return ''
  }
}

async function resolveModule(mod, opts) {
  const { root, dependenciesMap, parent } = opts
  const pkgRoot = await closest(root, mod.name)

  if (!pkgRoot) return {}

  const pkg = require(path.join(pkgRoot, 'package.json'))
  const main = typeof pkg.browser == 'string' ? pkg.browser : pkg.main || 'index.js'
  mod.entry = (mod.entry || main).replace(RE_EXT, '')
  const existingModule = findModule({ name: pkg.name, version: pkg.version }, dependenciesMap)

  if (existingModule && existingModule.entries[mod.entry]) return existingModule

  // If same version of the module exists already, just copy that
  const result = mod.name in parent.dependencies
    ? parent.dependencies[mod.name]
    : { dir: pkgRoot, dependencies: {}, main, version: pkg.version, alias: {}, entries: {} }
  const { alias, dependencies, entries } = result
  const resolved = opts.resolved || {}

  // https://github.com/erzu/porter/issues/1
  // https://github.com/browserify/browserify-handbook#browser-field
  if (typeof pkg.browser == 'object') Object.assign(alias, pkg.browser)

  async function resolveDependency(entry, context) {
    const [fpath, aliased] = entry.endsWith('/')
      ? await findComponent(`${entry}index.js`, [context])
      : await findComponent(`${entry}.js`, [context])

    if (aliased) alias[entry] = `${entry}/index`
    if (entry.endsWith('/')) alias[entry] = `${entry}index`
    if (!fpath) {
      return console.error(`Skipped ${entry} at ${context}`)
    }
    if (resolved[fpath]) return

    const content = await readFile(fpath, 'utf8')
    const deps = matchRequire.findAll(content)
    resolved[fpath] = true

    for (const dep of deps) {
      if (dep[0] == '.') {
        await resolveDependency(dep, path.dirname(fpath))
        continue
      }
      const [, name, depEntry] = dep.match(RE_NAME_ENTRY)
      if ((pkg.dependencies && name in pkg.dependencies) ||
          (pkg.devDependencies && name in pkg.devDependencies)) {
        dependencies[name] = await resolveModule({ name, entry: depEntry }, {
          root: pkgRoot, dependenciesMap, parent: result, resolved
        })
      }
      else if (pkg.peerDependencies && name in pkg.peerDependencies) {
        dependencies[name] = parent.dependencies[name]
      }
      else {
        unmetDependency(dep, pkg.name)
      }
    }
  }

  await resolveDependency(mod.entry, pkgRoot)
  entries[mod.entry] = true
  return result
}


/**
 * Warn about unmet dependency
 *
 * @param  {string} name      name of the dependency
 * @param  {string} dependent name of the dependent
 */
function unmetDependency(name, dependent) {
  console.warn(format('Unmet dependency %s required by %s',
    name, dependent)
  )
}


/**
 * Calculate the aliases of modules required by components.
 *
 * @param {Object}    opts
 * @param {string}   [opts.root=process.cwd()] Current working directory
 * @param {string}   [opts.base=components]    Components directory
 * @param {encoding} [opts.encoding=utf8]     Encoding of the components
 *
 * @returns {DependenciesMap}
 *
 * Something like:
 *
 * ```
 * {
 *   "yen": {
 *     "version": "1.2.1"
 *   },
 *   "ez-editor": {
 *     "version": "0.2.2",
 *     "dependencies": {
 *       "extend-object": {
 *         "main": "./extend-object.js",
 *         "version": "1.0.0"
 *       },
 *       "inherits": {
 *         "main": "./inherits_browser",
 *         "version": "2.0.1"
 *       }
 *     }
 *   }
 * }
 * ```
 */
async function parseMap(opts) {
  opts = Object.assign({
    root: process.cwd(),
    encoding: 'utf8',
    paths: 'components'
  }, opts)

  const { root, encoding } = opts
  const pkg = require(path.join(root, 'package.json'))
  const paths = [].concat(opts.paths).map(function(dir) {
    return path.resolve(root, dir)
  })
  const map = {
    [pkg.name]: {
      version: pkg.version,
      dependencies: {},
      main: pkg.main ? pkg.main.replace(RE_EXT, '') : 'index',
      alias: {}
    }
  }
  const { alias, dependencies } = map[pkg.name]

  async function resolveComponent(result, component) {
    for (const dep of component.dependencies) {
      const fullname = dep[0] == '.'
        ? path.join(path.dirname(component.id), dep)
        : dep

      const [fpath, aliased] = await findComponent(`${fullname}.js`, paths)
      if (fpath) {
        if (aliased) alias[dep] = `${dep}/index`
        continue
      }

      const [, name, entry] = fullname.match(RE_NAME_ENTRY)
      if (name == pkg.name || RE_URI.test(name)) continue
      if (name in result && result[name].entries[entry]) continue

      const version = (pkg.dependencies && pkg.dependencies[name]) ||
        (pkg.devDependencies && pkg.devDependencies[name])

      // specified in package.json.
      if (version) {
        result[name] = await resolveModule({ name, entry }, {
          root, dependenciesMap: map, parent: map[pkg.name]
        })
      } else {
        unmetDependency(name, component.id)
      }
    }

    return result
  }

  for (const currentPath of paths) {
    /**
     * glob all components within current path. js files within node_modules
     * shall be ignored because a component shall never reside in that.
     * paths like foo/node_modules cannot be ruled out by current approach.
     */
    const entries = (await glob('{*.js,!(node_modules)/**/*.js}', { cwd: currentPath }))
    const components = await Promise.all(
      entries.map(async function (entry) {
        const fpath = path.join(currentPath, entry)
        if ((await lstat(fpath)).isFile()) {
          return {
            id: entry.replace(RE_EXT, ''),
            dependencies: matchRequire.findAll(await readFile(fpath, encoding))
          }
        }
      })
    )

    for (const component of components.filter(item => !!item)) {
      await resolveComponent(dependencies, component)
    }
  }

  return map
}


module.exports = parseMap
