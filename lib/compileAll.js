'use strict'

var Promise = require('native-or-bluebird')
var path = require('path')
var glob = require('glob')
var debug = require('debug')('oceanify')
var mkdirp = require('mkdirp')
var fs = require('fs')
var co = require('co')
var UglifyJS = require('uglify-js')

var parseMap = require('./parseMap')
var flattenMap = require('./flattenMap')
var define = require('./define')

var ast = require('./cmd-util').ast
var deheredoc = require('./deheredoc')
var stripVersion = require('./stripVersion')


function globAsync(pattern) {
  return new Promise(function(resolve, reject) {
    glob(pattern, function(err, entries) {
      if (err) reject(err)
      else resolve(entries)
    })
  })
}

function mkdirpAsync(dir) {
  return new Promise(function(resolve, reject) {
    mkdirp(dir, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function writeFile(fpath, content) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(fpath, content, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(new Error(err.message))
      else resolve(content)
    })
  })
}

function exists(fpath) {
  return new Promise(function(resolve, reject) {
    fs.exists(fpath, resolve)
  })
}


var _cache = {}

function* _compileBundle(opts) {
  var base = opts.base

  var ids = []
  var components = []

  function* append(id) {
    var component = _cache[id]

    if (component) {
      yield* satisfy(component)
      return
    }

    var fpath = path.join(opts.base, stripVersion(id)) + '.js'
    var code = yield readFile(fpath, 'utf-8')
    var tree = ast.getAst('define(function(require, exports, module) {' + code + '})')
    component = ast.parseFirst(tree)
    var dependencies = component.dependencies

    for (var i = dependencies.length - 1; i >= 0; i--) {
      if (/heredoc$/.test(dependencies[i])) {
        dependencies.splice(i, 1)
      }
    }

    component.id = id
    component.ast = tree

    ast.modify(tree, {
      id: id,
      dependencies: dependencies
    })
    deheredoc(tree)

    _cache[id] = component

    yield* satisfy(component)
  }

  function* satisfy(component) {
    if (ids.indexOf(component.id) >= 0) return

    ids.unshift(component.id)
    components.unshift(component.ast)

    for (var i = 0, len = component.dependencies.length; i < len; i++) {
      var dep = component.dependencies[i]

      if (dep.charAt(0) === '.') {
        yield* append(path.join(path.dirname(component.id), dep))
      }
      else if (yield exists(path.join(base, dep + '.js'))) {
        yield* append(dep)
      }
    }
  }

  function join() {
    var modules
    var compressor = new UglifyJS.Compressor()

    /* eslint-disable camelcase */
    try {
      modules = components.map(function(component) {
        component.figure_out_scope()
        var compressed = component.transform(compressor)

        compressed.figure_out_scope()
        compressed.compute_char_frequency()
        compressed.mangle_names()

        return compressed.print_to_string({ ascii_only: true })
      })
    }
    catch (e) {
      throw new Error(e.message)
    }
    /* eslint-enable camelcase */

    return modules
  }

  yield* append(opts.id)
  return join()
}


/*
 * Compile all modules under base into target folder.
 *
 * Example:
 *
 *   compileAll({ base: './components', match: 'ma/*' })
 *   compileAll({ base: './node_modules', match: '{semver,heredoc}', dest: './public' })
 *
 * Return value:
 *
 *   A promise that will be resolved when all compilations finish
 */
function* compileAll(opts) {
  var cwd = opts.cwd || process.cwd()
  var base = path.resolve(cwd, opts.base || 'components')
  var dest = path.resolve(cwd, opts.dest || 'public')

  var dependenciesMap = yield parseMap({ cwd: cwd, base: base, dest: dest })
  var compiled = {}

  function* walk(deps) {
    for (var name in deps) {
      var mod = deps[name]
      var versions = compiled[name] || (compiled[name] = {})

      if (versions[mod.version]) continue

      yield* compileModule({
        base: path.resolve(mod.dir, '..'),
        name: name,
        main: (mod.main || 'index').replace(/\.js$/, ''),
        version: mod.version,
        dest: dest
      })

      yield* walk(mod.dependencies)
    }
  }

  yield* walk(dependenciesMap)
  var entries = yield globAsync(path.join(base, '{main,main/**/*}.js'))
  var loader = yield* compileLoader(dependenciesMap)

  for (var i = 0, len = entries.length; i < len; i++) {
    yield* compileComponent({
      base: base,
      dest: dest,
      id: path.relative(base, entries[i]).replace(/\.js$/, ''),
      loader: loader
    })
  }
}


function* compileLoader(dependenciesMap) {
  var system = flattenMap(dependenciesMap)
  var loader = yield readFile(path.join(__dirname, '../import.js'))
  var toplevel

  loader += define('system', [], 'module.exports = ' + JSON.stringify(system))
  toplevel = UglifyJS.parse(loader, {
    filename: 'import.js',
    toplevel: toplevel
  })

  /* eslint-disable camelcase, new-cap */
  toplevel.figure_out_scope()

  var compressor = UglifyJS.Compressor()
  var compressed = toplevel.transform(compressor)

  compressed.figure_out_scope()
  compressed.compute_char_frequency()
  compressed.mangle_names()

  debug('minified import.js')

  return compressed.print_to_string({ ascii_only: true })
  /* eslint-enable camelcase, new-cap */
}


function* compileComponent(opts) {
  var base = opts.base
  var dest = opts.dest
  var id = opts.id
  var loader = opts.loader

  var modules = yield* _compileBundle({
    id: id,
    base: base
  })

  modules.unshift(loader)

  yield* _saveBundle({
    dest: dest,
    id: id,
    content: modules.join('\n')
  })
}


function* compileModule(opts) {
  var base = opts.base
  var dest = opts.dest
  var name = opts.name
  var main = opts.main || 'index'
  var version = opts.version

  var id = path.join(name, version, main)
  var modules = yield* _compileBundle({
    id: id,
    base: base
  })

  yield* _saveBundle({
    dest: dest,
    id: id,
    content: modules.join('\n')
  })
}


function* _saveBundle(opts) {
  var dest = opts.dest
  var id = opts.id
  var content = opts.content

  var assetPath = path.join(dest, id + '.js')
  var assetDir = path.dirname(assetPath)

  yield mkdirpAsync(assetDir)
  yield writeFile(assetPath, content)

  debug('compiled %s', id)
}


exports.compileAll = co.wrap(compileAll)
exports.compileModule = co.wrap(compileModule)
exports.compileComponent = co.wrap(compileComponent)
