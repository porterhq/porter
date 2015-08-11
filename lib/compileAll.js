'use strict'

var Promise = require('native-or-bluebird')
var path = require('path')
var glob = require('glob')
var debug = require('debug')('oceanify')
var mkdirp = require('mkdirp')
var fs = require('fs')
var co = require('co')

var parseMap = require('./parseMap')
var flattenMap = require('./flattenMap')
var compileBundle = require('./compileBundle')
var define = require('./define')


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
  var modules = {}


  function* walk(deps) {
    for (var name in deps) {
      var mod = deps[name]
      var versions = modules[name] || (modules[name] = {})

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
  var system = flattenMap(dependenciesMap)

  for (var i = 0, len = entries.length; i < len; i++) {
    yield* compileComponent({
      base: base,
      dest: dest,
      id: path.relative(base, entries[i]).replace(/\.js$/, ''),
      system: system
    })
  }
}


function* compileComponent(opts) {
  var base = opts.base
  var dest = opts.dest
  var id = opts.id
  var system = opts.system

  var modules = yield* compileBundle({
    id: id,
    base: base
  })

  modules.unshift(define('system', [], 'module.exports = ' + JSON.stringify(system)))

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
  var modules = yield* compileBundle({
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
