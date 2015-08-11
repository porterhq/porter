'use strict'

var fs = require('fs')
var path = require('path')
var UglifyJS = require('uglify-js')

var ast = require('./cmd-util').ast
var deheredoc = require('./deheredoc')
var stripVersion = require('./stripVersion')


var readFile = function(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(new Error(err.message))
      else resolve(content)
    })
  })
}

var _cache = {}


function* _compileBundle(opts) {
  var ids = []
  var components = []

  function* append(id) {
    var component = _cache[id]

    if (component) {
      yield* satisfy(component)
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
        yield append(path.join(path.dirname(component.id), dep))
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

  yield append(opts.id)
  return join()
}


module.exports = _compileBundle
