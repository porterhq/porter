'use strict'


var UglifyJS = require('uglify-js')
var path = require('path')
var fs = require('fs')
var mkdirp = require('mkdirp')

var readFileAsync = function(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(err)
      else resolve(content)
    })
  })
}

var writeFileAsync = function(fpath, content) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(fpath, content, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

var mkdirAsync = function(dir) {
  return new Promise(function(resolve, reject) {
    mkdirp(dir, function(err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

var ast = require('./cmd-util').ast
var deheredoc = require('./deheredoc')

var _cache = {}


function compile(opts) {
  var ids = []
  var components = []

  function append(id) {
    var component = _cache[id]

    if (component) {
      return satisfy(component)
    }

    return readFileAsync(path.join(opts.base, id + '.js'), 'utf-8').then(function(code) {
      var tree = ast.getAst('define(function(require, exports, module) {' + code + '})')
      var component = ast.parseFirst(tree)
      var dependencies = component.dependencies

      for (var i = dependencies.length - 1; i >= 0; i--) {
        if (/heredoc$/.test(dependencies[i])) {
          dependencies.splice(i, 1)
        }
      }

      component.id = id
      component.ast = tree

      ast.modify(tree, {
        id: component.id.replace(opts.name, opts.name + '/' + opts.version),
        dependencies: dependencies
      })
      deheredoc(tree)

      _cache[id] = component

      return satisfy(component)
    })
  }

  function satisfy(component) {
    if (ids.indexOf(component.id) >= 0) return

    ids.unshift(component.id)
    components.unshift(component.ast)

    function iterate(dep) {
      var id = dep

      if (id.charAt(0) === '.') {
        id = path.join(path.dirname(component.id), dep)
        return append(id)
      }
    }

    return Promise.all(component.dependencies.map(iterate))
  }

  function join() {
    var modules
    var compressor = new UglifyJS.Compressor()

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

    return modules
  }

  return append(path.join(opts.name, opts.main.replace(/.js$/, '')))
    .then(join)
}


function compileModule(opts) {
  var main
  var version

  return readFileAsync(path.join(opts.base, opts.name, 'package.json'), 'utf-8')
    .then(JSON.parse)
    .then(function(pkg) {
      version = pkg.version
      main = pkg.main || 'index.js'

      return compile({
        base: opts.base,
        name: opts.name,
        version: version,
        main: main
      })
    })
    .then(function(modules) {
      var fpath = path.join(opts.dest, opts.name, version, main)
      return mkdirAsync(path.dirname(fpath)).then(function() {
        return writeFileAsync(fpath, modules.join('\n'))
      })
    })
}


module.exports = compileModule
