/* eslint-env browser */
/* eslint-disable semi-spacing, strict */
(function(global) {

  // do not override
  if (global.oceanify) return

  var system = {
    preload: [],
    registry: {}
  }
  var registry = system.registry


  var ArrayFn = Array.prototype

  if (!Object.assign) {
    Object.assign = function() {
      var args = ArrayFn.slice.call(arguments)
      var target = args.shift()

      while (args.length) {
        var source = args.shift()

        for (var p in source) {
          if (source != null) {
            if (source.hasOwnProperty(p)) {
              target[p] = source[p]
            }
          }
        }
      }

      return target
    }
  }

  if (!Date.now) {
    Date.now = function() {
      return +new Date()
    }
  }


  var doc = document
  var head = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement
  var baseElement = head.getElementsByTagName('base')[0] || null

  function request(url, callback) {
    var el = doc.createElement('script')

    onload(el, function(err) {
      el.onload = el.onerror = el.onreadystatechange = null
      // head.removeChild(el)
      el = null
      callback(err)
    })
    el.async = true
    el.src = url

    // baseElement cannot be undefined in IE8-.
    head.insertBefore(el, baseElement)
  }

  function onload(el, callback) {
    if ('onload' in el) {
      el.onload = function() {
        callback()
      }
      el.onerror = function() {
        callback(new Error('Failed to fetch ' + el.src))
      }
    }
    else {
      // get called multiple times
      // https://msdn.microsoft.com/en-us/library/ms534359(v=vs.85).aspx
      el.onreadystatechange = function() {
        if (/loaded|complete/.test(el.readyState)) {
          callback()
        }
      }
    }
  }


  /*
   * resolve paths
   */
  var RE_DIRNAME = /([^?#]*)\//
  var RE_DUPLICATED_SLASH = /(^|[^:])\/\/+/g

  function dirname(fpath) {
    var m = fpath.match(RE_DIRNAME)
    return m ? m[1] : '.'
  }

  function resolve() {
    var args = ArrayFn.slice.call(arguments)
    var base = args.shift()
    var levels = base ? base.split('/') : []

    while (args.length) {
      var parts = args.shift().split('/')
      while (parts.length) {
        var part = parts.shift()
        if (part === '..') {
          if (levels.length) {
            levels.pop()
          } else {
            throw new Error('Top level reached.')
          }
        }
        else if (part !== '.') {
          levels.push(part)
        }
      }
    }

    for (var i = levels.length - 1; i >= 0; i--) {
      if (levels[i] === '.') levels.splice(i, 1)
    }

    return levels.join('/').replace(RE_DUPLICATED_SLASH, '$1/')
  }


  /*
   * Resovle id with the version tree
   */
  var RE_VERSION = /^\d+\.\d+\.\d+/

  function parseId(id) {
    var parts = id.split('/')
    var name = parts.shift()

    if (name.charAt(0) === '@') {
      name += '/' + parts.shift()
    }

    if (name in system.modules) {
      var version = RE_VERSION.test(parts[0]) ? parts.shift() : ''
      return {
        name: name,
        version: version,
        entry: parts.join('/')
      }
    }
    else {
      return { name: id }
    }
  }


  function parseMap(uri) {
    var map = system.map
    var ret = uri

    if (map) {
      for (var pattern in map) {
        ret = uri.replace(new RegExp('^' + pattern), map[pattern])
        // Only apply the first matched rule
        if (ret !== uri) break
      }
    }

    return ret
  }


  function parseBase(main) {
    var scripts = doc.scripts || doc.getElementsByTagName('script')
    var script = scripts[scripts.length - 1]
    var src = script.src.split('?')[0].replace(/\.js$/, '')
    var rmain = new RegExp(main + '$', '')

    system.base = script.getAttribute('data-base') ||
      (src && rmain.test(src) && src.replace(rmain, '')) ||
      '/'
  }


  var MODULE_INIT = 0
  var MODULE_FETCHING = 1
  var MODULE_FETCHED = 2
  var MODULE_RESOLVING = 3
  var MODULE_RESOLVED = 4
  var MODULE_EXECUTED = 5
  var MODULE_ERROR = 6


  function importFactory(context) {
    context = context || ''
    var entryId = 'import-' + (+new Date()).toString(36)

    return function(ids, fn) {
      if (!system.base) parseBase(ids[ids.length - 1])
      if (typeof ids === 'string') ids = [ids]
      var mod = new Module(resolve(context, entryId))

      mod.dependencies = ids
      mod.factory = function(require) {
        var mods = ids.map(function(id) { return require(id) })
        if (fn) fn.apply(null, mods)
      }
      mod.status = MODULE_FETCHED
      mod.resolve()
    }
  }


  function Module(id, opts) {
    opts = opts || {}
    this.id = id
    this.dependencies = opts.dependencies
    this.dependents = []
    this.factory = opts.factory
    this.status = MODULE_INIT
    registry[id] = this
  }

  /**
   * To match against following uris:
   * - https://example.com/foo.js
   * - http://example.com/bar.js
   * - //example.com/ham.js
   * - /egg.js
   */
  var RE_URI = /^(?:https?:)?\//

  Module.prototype.fetch = function() {
    var mod = this

    if (mod.status < MODULE_FETCHING) {
      mod.status = MODULE_FETCHING
      var id = parseMap(mod.id)
      var uri = RE_URI.test(id)
        ? id
        : resolve(system.base, mod.id)

      if (!(uri.indexOf('?') > 0 || /\.js$/.test(uri))) {
        uri = uri + '.js'
      }

      request(uri, function(err) {
        mod.status = err ? MODULE_ERROR : MODULE_FETCHED
        mod.uri = uri
        mod.resolve()
      })
    }
    else if (mod.status === MODULE_FETCHED) {
      mod.resolve()
    }
  }

  Module.prototype.resolve = function() {
    var mod = this
    var deps = mod.dependencies

    mod.status = MODULE_RESOLVING

    deps = (mod.dependencies || []).map(function(depName) {
      var depId = Module.resolve(depName, mod.id)
      return registry[depId] || new Module(depId)
    })

    deps.forEach(function(dep) {
      dep.dependents.push(mod)
      dep.fetch()
    })

    /*
     * No more dependencies to resolve. Let's get the back track started.
     */
    var resolved = deps.length === 0 || !deps.some(function(dep) {
      return dep.status < MODULE_RESOLVED
    })

    if (resolved) mod.resolved()
  }

  Module.prototype.resolved = function() {
    var mod = this
    var dependents = mod.dependents

    if (mod.status < MODULE_RESOLVED) {
      mod.status = MODULE_RESOLVED
    }

    for (var i = 0, len = dependents.length; i < len; i++) {
      var parent = dependents[i]
      var allset = true

      for (var j = 0; j < parent.dependencies.length; j++) {
        var depId = Module.resolve(parent.dependencies[j], parent.id)
        var dep = registry[depId]

        if (dep.status < MODULE_RESOLVED) {
          allset = false
          break
        }
      }

      if (allset) parent.resolved()
    }

    if (!dependents.length) {
      mod.execute()
    }
  }

  Module.prototype.execute = function() {
    var factory = this.factory
    var mod = this

    if (mod.status >= MODULE_EXECUTED) return

    function require(id) {
      id = Module.resolve(id, mod.id)
      var dep = registry[id]

      if (dep.status < MODULE_RESOLVED) {
        throw new Error('Module ' + id + ' should be resolved by now')
      }
      else if (dep.status < MODULE_EXECUTED) {
        dep.execute()
      }

      return dep.exports
    }

    require.async = importFactory(dirname(mod.id))

    mod.exports = {}

    var exports = typeof factory === 'function'
      ? factory.call(null, require, mod.exports, mod)
      : factory

    if (exports) {
      mod.exports = exports
    }

    mod.status = MODULE_EXECUTED
  }


  Module.resolve = function(id, context) {
    if (!system.modules || !context || RE_URI.test(id)) return id

    var map = system.modules
    var parent = parseId(context)
    var opts = parent.name in map
      ? map[parent.name][parent.version]
      : map[system.name][system.version]

    if (opts.alias && (id in opts.alias)) {
      id = opts.alias[id]
    }

    if (id.charAt(0) === '.') return resolve(dirname(context), id)

    var deps = opts.dependencies
    var mod = parseId(id)
    var name = mod.name

    if (mod.version) return id
    if (name == system.name) {
      return resolve(name, system.version, mod.entry || system.main)
    }

    // if module doesn't present in current dependencies, try system dependencies
    if (!(name in deps)) deps = map[system.name][system.version].dependencies
    if (name in deps) {
      var version = deps[name]
      var pkg = map[name][version]
      var entry = mod.entry && pkg.alias && mod.entry in pkg.alias
        ? pkg.alias[mod.entry]
        : (mod.entry || pkg.main || 'index')

      return resolve(name, version, entry.replace(/\.js$/, ''))
    }

    // must be system component if none of previous conditions met.
    return resolve(system.name, system.version, id)
  }


  var globalImport = importFactory()

  Object.assign(system, {
    'import': function(ids, fn) {
      globalImport([].concat(system.preload, ids), fn)
    },

    config: function(opts) {
      return Object.assign(system, opts)
    }
  })


  global.define = function define(id, deps, factory) {
    if (!factory) {
      factory = deps
      deps = []
    }

    var mod = registry[id] || registry[id + '.js'] || new Module(id)

    mod.dependencies = deps
    mod.factory = factory
    mod.status = MODULE_FETCHED
  }

  global.oceanify = system

  global.process = {
    env: {
      NODE_ENV: '${NODE_ENV}'
    }
  }
})(this)
