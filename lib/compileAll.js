'use strict'

var path = require('path')
var glob = require('glob')
var debug = require('debug')('oceanify')
var mkdirp = require('mkdirp')
var fs = require('fs')
var UglifyJS = require('uglify-js')
var semver = require('semver')

var parseMap = require('./parseMap')
var parseSystem = require('./parseSystem')
var define = require('./define')

var deheredoc = require('./deheredoc')
var matchRequire = require('match-require')


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


/*
 * The module id might be something like:
 *
 * - `ink/0.2.0/index`
 * - `ink/0.2.0/lib/display_object`
 * - `@org/name/0.1.0/index`
 *
 * Use this method to remove the version part out of it.
 */
function stripVersion(id) {
  var parts = id.split('/')

  for (var i = parts.length - 1; i >= 0; i--) {
    if (semver.valid(parts[i])) {
      parts.splice(i, 1)
      break
    }
  }

  return parts.join('/')
}


function* _compileBundle(opts) {
  var cwd = opts.cwd
  var base = opts.base
  var dest = opts.dest
  var toplevel = opts.toplevel

  var ids = []

  function* append(id) {
    var fpath = path.join(base, stripVersion(id)) + '.js'
    var code = yield readFile(fpath, 'utf-8')
    var dependencies = matchRequire.findAll(code)

    for (var i = dependencies.length - 1; i >= 0; i--) {
      if (/heredoc$/.test(dependencies[i])) {
        dependencies.splice(i, 1)
      }
    }

    toplevel = UglifyJS.parse(define(id, dependencies, code), {
      filename: '/' + path.relative(cwd, fpath),
      toplevel: toplevel
    })

    yield* satisfy({ id: id, dependencies: dependencies })
  }

  function* satisfy(component) {
    if (ids.indexOf(component.id) >= 0) return

    ids.unshift(component.id)

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

  /* eslint-disable camelcase */
  function* bundle(id) {
    var compressor = new UglifyJS.Compressor()

    deheredoc(toplevel)
    toplevel.figure_out_scope()

    var compressed = toplevel.transform(compressor)

    compressed.figure_out_scope()
    compressed.compute_char_frequency()
    compressed.mangle_names()

    var source_map = new UglifyJS.SourceMap({
      file: id + '.js',
      root: ''
    })
    var stream = new UglifyJS.OutputStream({
      ascii_only: true,
      source_map: source_map
    })

    compressed.print(stream)

    var assetPath = path.join(dest, id + '.js')

    yield mkdirpAsync(path.dirname(assetPath))
    yield [
      writeFile(assetPath, stream.toString() + '\n//# sourceMappingURL=/' + opts.id + '.js.map'),
      writeFile(assetPath + '.map', source_map.toString())
    ]

    debug('compiled %s', id)
  }
  /* eslint-enable camelcase */

  yield* append(opts.id)
  yield* bundle(opts.id)
}


/*
 * Compile all modules under base into target folder.
 *
 * Example:
 *
 *   compileAll({ base: './components', match: 'main/*' })
 *
 * Return value:
 *
 *   A promise that will be resolved when all compilations finish
 */
function* compileAll(opts) {
  opts = opts || {}
  var cwd = opts.cwd || process.cwd()
  var base = path.resolve(cwd, opts.base || 'components')
  var dest = path.resolve(cwd, opts.dest || 'public')
  var match = opts.match || '{main,main/**/*}.js'

  var dependenciesMap = yield parseMap({ cwd: cwd, base: base, dest: dest })
  var compiled = {}

  function* walk(deps) {
    for (var name in deps) {
      var mod = deps[name]
      var versions = compiled[name] || (compiled[name] = {})

      if (versions[mod.version]) continue

      yield* compileModule({
        cwd: cwd,
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
  var entries = yield globAsync(path.join(base, match))

  if (!entries.length) {
    console.error('Found no entries that macth %s in %s', opts.match, base)
    return
  }

  for (var i = 0, len = entries.length; i < len; i++) {
    yield* compileComponent({
      cwd: cwd,
      base: base,
      dest: dest,
      id: path.relative(base, entries[i]).replace(/\.js$/, ''),
      toplevel: yield* parseLoader(dependenciesMap)
    })
  }
}


function* parseLoader(dependenciesMap) {
  var system = parseSystem(dependenciesMap)
  var loader = yield readFile(path.join(__dirname, '../import.js'))

  loader += define('system', [], 'module.exports = ' + JSON.stringify(system))

  return UglifyJS.parse(loader, {
    filename: '/import.js'
  })
}


function* compileComponent(opts) {
  var cwd = opts.cwd || process.cwd()
  var base = path.resolve(cwd, opts.base || 'components')
  var dest = path.resolve(cwd, opts.dest || 'public')
  var id = opts.id
  var toplevel = opts.toplevel

  yield* _compileBundle({
    cwd: cwd,
    id: id,
    base: base,
    dest: dest,
    toplevel: toplevel
  })
}


function* compileModule(opts) {
  var cwd = opts.cwd || process.cwd()
  var base = path.resolve(cwd, opts.base || 'components')
  var dest = path.resolve(cwd, opts.dest || 'public')
  var name = opts.name
  var main = opts.main || 'index'
  var version = opts.version

  yield* _compileBundle({
    cwd: cwd,
    id: path.join(name, version, main),
    base: base,
    dest: dest
  })
}


exports.compileAll = compileAll
exports.compileModule = compileModule
exports.compileComponent = compileComponent
