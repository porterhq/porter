'use strict';

var path = require('path')
var fs = require('fs')
var semver = require('semver')

var parse = require('./lib/parse')
var define = require('./lib/define')

var cwd = process.cwd()


function golem(opts) {
  opts = opts || {}
  var bases = ['node_modules', opts.base || 'components']
  var encoding = opts.encoding || 'utf-8'

  bases = bases.map(function(base) {
    if (base[0] !== '/' && !/^\w:/.test(base))
      return path.join(cwd, base)
    else
      return base
  })

  var local = opts.local

  function parseLocal(id) {
    if (!local) return

    for (var p in local) {
      if (id.indexOf(p) === 0)
        return path.resolve(cwd, local[p], path.relative(p, id))
    }
  }

  /*
   * The req.path might be something like:
   *
   * - `/@ali/ink/0.2.0/index.js`
   * - `/@ali/ink/0.2.0/lib/display_object.js`
   *
   * Use this method to remove the version part out of req.path.
   *
   * Should we implement version check against ./node_modules/@ali/ink/package.json here?
   */
  function stripVersion(id) {
    var parts = id.split('/')

    for (var i = 0, len = parts.length; i < len; i++) {
      if (semver.valid(parts[i]))
        parts.splice(i, 1)
    }

    return parts.join('/')
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

      var fpath = (parseLocal(id) || path.join(base, stripVersion(id))) + '.js'

      fs.exists(fpath, function(exists) {
        if (exists)
          callback(null, fpath)
        else
          findComponent(id, callback)
      })
    }

    function sendComponent(err, factory) {
      if (err) return next(err)

      var deps = parse(factory)

      if (res.is) {
        res.status = 200
        res.type = 'application/javascript'
        res.body = define({ id: id, dependencies: deps, factory: factory })
        next()
      }
      else {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/javascript')
        res.write(define({ id: id, dependencies: deps, factory: factory }), encoding)
        res.end()
      }
    }

    findComponent(id, function(err, fpath) {
      if (err) return next(err)
      fs.readFile(fpath, encoding, sendComponent)
    })
  }
}


golem.parseDependencies = require('./lib/parse')
golem.compile = require('./lib/compile')
golem.compileAll = require('./lib/compileAll')


// Expose golem
module.exports = golem
