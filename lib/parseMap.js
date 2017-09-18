'use strict'

/**
 * @module
 */

const path = require('path')
const format = require('util').format
const matchRequire = require('match-require')
const fs = require('mz/fs')

const glob = require('./glob')

const { readFile, exists, lstat } = fs


function* closest(root, name) {
  const fpath = path.join(root, 'node_modules', name)

  if (yield exists(fpath)) {
    return fpath
  } else if (root.indexOf('/node_modules/') > 0) {
    while (path.basename(root) !== 'node_modules') {
      root = path.resolve(root, '..')
    }
    return yield* closest(path.resolve(root, '..'), name)
  } else {
    return ''
  }
}


function* resolveModule(opts) {
  const pkgRoot = opts.pkgRoot || (yield closest(opts.root, opts.name))

  if (!pkgRoot) {
    return { version: opts.version }
  }

  const pkg = require(path.join(pkgRoot, 'package.json'))
  const main = typeof pkg.browser === 'string'
    ? pkg.browser
    : pkg.main || 'index.js'

  const dependencies = {}
  const mapPath = opts.mapPath || []
  const fpathResolved = {}
  const alias = {}

  function* resolveDependency(entry, context) {
    let fpath = path.join(context, entry.replace(/(?:\.js)?$/, '.js'))

    if (fpathResolved[fpath]) return
    fpathResolved[fpath] = true

    let content
    try {
      content = yield readFile(fpath, 'utf8')
    } catch (err) {
      try {
        fpath = path.join(context, entry, 'index.js')
        content = yield readFile(fpath, 'utf8')
        alias[entry] = `${entry}/index`
      } catch (err2) {
        console.error(`Skipped ${entry} at ${context}`)
        return
      }
    }
    const deps = matchRequire.findAll(content)

    for (const dep of deps) {
      const name = dep[0] == '.'
        ? dep
        : dep.split('/').slice(0, dep[0] == '@' ? 2 : 1).join('/')

      if (name[0] === '.') {
        yield* resolveDependency(name, path.dirname(fpath))
      }
      else if (mapPath.includes(name)) {
        // cyclic dependencies
      }
      else if ((pkg.dependencies && name in pkg.dependencies) || (pkg.devDependencies && name in pkg.devDependencies)) {
        mapPath.push(pkg.name)
        dependencies[name] = yield* resolveModule({
          root: pkgRoot,
          name,
          mapPath
        })
      }
      else if (pkg.peerDependencies && name in pkg.peerDependencies) {
        // peer dependencies
      }
      else {
        unmetDependency(name, pkg.name)
      }
    }
  }

  yield* resolveDependency(main, pkgRoot)

  return {
    dir: pkgRoot,
    dependencies,
    main,
    version: pkg.version,
    alias
  }
}


/**
 * Find the path of a component in mutiple base directories
 *
 * @param {string} id
 * @param {Array}  bases
 * @yield {string} path of the component found
 */
function* findComponent(id, bases) {
  for (const base of bases) {
    const componentPath = path.join(base, id)
    if (yield exists(componentPath)) {
      return componentPath
    }
  }
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
function* parseMap(opts) {
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
  const dependencies = {}

  function* resolveComponent(result, meta) {
    for (const name of meta.dependencies) {
      if (name[0] == '.' ||
          name in result ||
          name == pkg.name ||
          (yield* findComponent(`${name}.js`, paths))) {
        continue
      }

      const version = (pkg.dependencies && pkg.dependencies[name]) ||
        (pkg.devDependencies && pkg.devDependencies[name])

      // specified in package.json.
      if (version) {
        result[name] = yield* resolveModule({ name, root })
      } else {
        unmetDependency(name, meta.id)
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
    const pattern = path.join(currentPath, '{*.js,!(node_modules)/**/*.js}')
    const entries = (yield glob(pattern, { cwd: currentPath }))
    const components = yield entries.map(function* (fpath) {
      if ((yield lstat(fpath)).isFile()) {
        return {
          id: path.relative(currentPath, fpath).replace(/\.js$/, ''),
          dependencies: matchRequire.findAll(yield readFile(fpath, encoding))
        }
      }
    })

    for (const component of components.filter(item => !!item)) {
      yield* resolveComponent(dependencies, component)
    }
  }

  return dependencies
}


module.exports = parseMap
