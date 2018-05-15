/* eslint-env browser */
/* eslint-disable semi-spacing, strict */
(function(global) {

  // do not override
  if (global.porter) return

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
  var rModuleId = /^((?:@[^\/]+\/)?[^\/]+)(?:\/(\d+\.\d+\.\d+[^\/]*))?(?:\/(.*))?$/

  function parseId(id) {
    var m = id.match(rModuleId)
    return { name: m[1], version: m[2], entry: m[3] }
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
    var entryId = 'import-' + (+new Date()).toString(36)

    return function(ids, fn) {
      if (!system.base) parseBase(ids[ids.length - 1])
      if (typeof ids === 'string') ids = [ids]
      var mod = new Module(resolve(context, entryId))

      mod.deps = ids
      mod.factory = function(require) {
        var mods = ids.map(function(id) { return require(id) })
        if (fn) fn.apply(null, mods)
      }
      mod.status = MODULE_FETCHED
      mod.resolve()
    }
  }

  /**
   * The Module class
   * @param {string} id
   * @param {Object} opts
   * @param {string[]} opts.deps
   * @param {function} opts.factory
   * @example
   * new Module('jquery/3.3.1/dist/jquery')
   * new Module('//g.alicdn.com/alilog/mlog/aplus_v2.js')
   */
  function Module(id, opts) {
    opts = opts || {}
    this.id = id
    this.deps = opts.deps
    this.children = []
    this.parents = []
    this.cycles = []
    this.factory = opts.factory
    this.status = MODULE_INIT
    registry[id] = this
  }

  /**
   * Check if current module is ancestor of dep. That is, current module requires dep either directly or indirectly.
   * @param {Module} dep
   * @returns {boolean}
   */
  Module.prototype.depends = function(dep, distance) {
    var mod = this
    if (!distance) distance = 1
    if (distance > 5) return false
    // If current module is one of dep's cyclic dependencies already, no need to go any further.
    if (dep.cycles.indexOf(mod) >= 0) return false
    for (var i = 0; i < dep.parents.length; i++) {
      var parent = dep.parents[i]
      if (parent == mod) return true
      if (mod.depends(parent, distance + 1)) return true
    }
    return false
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
    mod.status = MODULE_RESOLVING
    var children = mod.children = (mod.deps || []).map(function(depName) {
      var depId = Module.resolve(depName, mod.id)
      return registry[depId] || new Module(depId)
    })

    children.forEach(function(child) {
      if (child.depends(mod)) mod.cycles.push(child)
      if (child.parents.indexOf(mod) < 0) child.parents.push(mod)
      child.fetch()
    })

    // No more children to resolve. Let's get the back track started.
    var resolved = children.length === 0 || !children.some(function(dep) {
      return mod.cycles.indexOf(dep) < 0 && dep.status < MODULE_RESOLVED
    })

    if (resolved) mod.resolved()
  }

  Module.prototype.resolved = function() {
    var mod = this
    var parents = mod.parents

    if (mod.status < MODULE_RESOLVED) {
      mod.status = MODULE_RESOLVED
    }

    for (var i = 0, len = parents.length; i < len; i++) {
      var parent = parents[i]
      var siblings = parent.children
      var allset = true

      for (var j = 0; j < siblings.length; j++) {
        var sibling = siblings[j]
        if (parent.cycles.length > 0 && parent.cycles.indexOf(sibling) >= 0) continue
        if (sibling.status < MODULE_RESOLVED) {
          allset = false
          break
        }
      }

      if (allset && parent.status < MODULE_RESOLVED) parent.resolved()
    }

    // We've reached the root module. Start the execution.
    if (!parents.length) mod.execute()
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
    mod.exports = mod.exports || {}
    mod.status = MODULE_EXECUTED

    var exports = typeof factory === 'function'
      ? factory.call(null, require, mod.exports, mod)
      : factory

    if (exports) mod.exports = exports
  }

  /**
   * @param {string} id
   * @param {string} context
   * @example
   * Module.resolve('./lib/foo', 'app/1.0.0/home')
   * Module.resolve('lib/foo', 'app/1.0.0/home')
   * Module.resolve('react', 'app/1.0.0)
   */
  Module.resolve = function(id, context) {
    if (!system.modules || RE_URI.test(id)) return id
    if (id.charAt(0) === '.') id = resolve(dirname(context), id)

    var modules = system.modules
    var parent = parseId(context)
    var parentMap = modules[parent.name][parent.version]
    var systemMap = modules[system.name][system.version]

    var mod = parseId(id)
    if (!(mod.name in modules)) {
      mod = { name: system.name, version: system.version, entry: id }
    }
    var name = mod.name
    var version = mod.version
    var map

    if (version) {
      map = modules[name][version]
    }
    else if (parentMap && parentMap.dependencies && (name in parentMap.dependencies)) {
      if (!version) version = parentMap.dependencies[name]
      map = modules[name][version]
    }
    else if (name in systemMap.dependencies) {
      if (!version) version = systemMap.dependencies[name]
      map = modules[name][version]
    }
    else {
      version = system.version
      map = systemMap
    }

    var entry = mod.entry || map.main || 'index'
    if (map.alias && entry in map.alias) entry = map.alias[entry]
    return resolve(name, version, entry.replace(/\.js$/, ''))
  }

  Object.assign(system, {
    'import': function(ids, fn) {
      importFactory([system.name, system.version].join('/'))([].concat(system.preload, ids), fn)
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

    var mod = registry[id] || registry[id + '.js'] || registry[id.replace(/\.js$/, '')] || new Module(id)

    mod.deps = deps
    mod.factory = factory
    mod.status = MODULE_FETCHED
  }

  global.porter = system

  global.process = {
    env: {
      BROWSER: true,
      NODE_ENV: process.env.NODE_ENV
    }
  }
})(this)

if (process.env.NODE_ENV != 'production' && 'serviceWorker' in navigator && (location.protocol == 'https:' || location.hostname == 'localhost')) {
  navigator.serviceWorker.register('/porter-sw.js', { scope: '/' }).then(function(registration) {
    if (registration.waiting || registration.active) {
      var worker = registration.waiting || registration.active
      var system = window.porter
      worker.postMessage({
        type: 'loaderConfig',
        data: {
          name: system.name,
          version: system.version,
          cacheExcept: system.cacheExcept
        }
      })
    }
  })
}
