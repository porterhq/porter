'use strict';

var path = require('path')
var fs = require('fs')
var parser = require('./lib/parser')
var define = require('./lib/define')

var cwd = process.cwd()


function golem(opts) {
  opts = opts || {}
  var bases = ['node_modules', opts.base || 'components']
  var encoding = opts.encoding || 'utf-8'

  bases = bases.map(function(base) {
    if (base[0] !== '/' && !/^\w:/.test(base))
      return path.join(cwd, base)
  })

  var local = opts.local

  function parseLocal(id) {
    if (!local) return

    for (var p in local) {
      if (id.indexOf(p) === 0)
        return path.resolve(cwd, local[p], path.relative(p, id))
    }
  }

  return function(req, res, next) {
    if (!req.path) {
      Object.defineProperty(req, 'path', {
        get: function() {
          return this.url.split('?')[0]
        }
      })
    }

    if (path.extname(req.path) !== '.js') return next()

    var id = req.path.slice(1).replace(/\.js$/, '')
    var _bases = [].concat(bases)


    function findComponent(id, callback) {
      var base = _bases.shift()

      if (!base) {
        return callback(new Error('Cannot find component ' + id))
      }

      var fpath = (parseLocal(id) || path.join(base, id)) + '.js'

      fs.exists(fpath, function(exists) {
        if (exists)
          callback(null, fpath)
        else
          findComponent(id, callback)
      })
    }

    function sendComponent(err, factory) {
      if (err) return next(err)

      var deps = parser(factory)

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/javascript')
      res.write(define({ id: id, dependencies: deps, factory: factory }), encoding)
      res.end()
    }

    findComponent(id, function(err, fpath) {
      if (err) return next(err)
      fs.readFile(fpath, encoding, sendComponent)
    })
  }
}


golem.compile = require('./lib/compile')
golem.compileAll = require('./lib/compileAll')

// Expose golem
module.exports = golem
