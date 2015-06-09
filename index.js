'use strict'

var path = require('path')
var fs = require('fs')
var semver = require('semver')

var parse = require('./lib/parse')
var define = require('./lib/define')

var cwd = process.cwd()


function oceanify(opts) {
  opts = opts || {}
  var bases = ['node_modules', opts.base || 'components']
  var encoding = opts.encoding || 'utf-8'

  bases = bases.map(function(base) {
    return base[0] !== '/' && !/^\w:/.test(base)
      ? path.join(cwd, base)
      : base
  })

  var local = opts.local

  function parseLocal(id) {
    if (!local) return

    for (var p in local) {
      if (id.indexOf(p) === 0) {
        return path.resolve(cwd, local[p], path.relative(p, id))
      }
    }
  }

  /*
   * The req.path might be something like:
   *
   * - `/ink/0.2.0/index.js`
   * - `/ink/0.2.0/lib/display_object.js`
   *
   * Use this method to remove the version part out of req.path.
   *
   * Should we implement version check against ./node_modules/ink/package.json here?
   */
  function stripVersion(id) {
    return id.split('/')
      .filter(function(part) {
        return !semver.valid(part)
      })
      .join('/')
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

    function findComponent(moduleId, callback) {
      var base = _bases.shift()

      if (!base) {
        return callback(new Error('Cannot find component ' + moduleId))
      }

      var fpath = (parseLocal(moduleId) || path.join(base, stripVersion(moduleId))) + '.js'

      fs.exists(fpath, function(exists) {
        if (exists) {
          callback(null, fpath)
        } else {
          findComponent(moduleId, callback)
        }
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


oceanify.parseDependencies = require('./lib/parse')
oceanify.compile = require('./lib/compile')
oceanify.compileAll = require('./lib/compileAll')
oceanify.compileModule = require('./lib/compileModule')


// Expose oceanify
module.exports = oceanify
