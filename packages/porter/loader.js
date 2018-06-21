/* eslint-env browser */
/* eslint-disable semi-spacing, strict */
(function(global) {

  // do not override
  if (global.porter) return

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


  var system = { lock: {}, registry: {}, entries: {} }
  var lock = system.lock
  var registry = system.registry
  Object.assign(system, process.env.loaderConfig)
  var baseUrl = system.baseUrl.replace(/([^\/])$/, '$1/')
  var pkg = system.package


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

  var request

  if (typeof importScripts == 'function') {
    /* eslint-env worker */
    request = function loadScript(url, callback) {
      try {
        importScripts(url)
      } catch (err) {
        return callback(err)
      }
      callback()
    }
  }
  else {
    var doc = document
    var head = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement
    var baseElement = head.getElementsByTagName('base')[0] || null

    request = function loadScript(url, callback) {
      var el = doc.createElement('script')

      onload(el, function(err) {
        el = el.onload = el.onerror = el.onreadystatechange = null
        // head.removeChild(el)
        callback(err)
      })
      el.async = true
      el.src = url

      // baseElement cannot be undefined in IE8-.
      head.insertBefore(el, baseElement)
    }
  }


  /*
   * resolve paths
   */
  var RE_DIRNAME = /([^?#]*)\//

  function dirname(fpath) {
    var m = fpath.match(RE_DIRNAME)
    return m ? m[1] : '.'
  }

  function resolve() {
    var args = ArrayFn.slice.call(arguments)
    var levels = []
    var i = 0

    while (i < args.length) {
      var parts = args[i++].split('/')
      var j = 0
      while (j < parts.length) {
        var part = parts[j++]
        if (part === '..') {
          if (levels.length) {
            levels.pop()
          } else {
            throw new Error('Top level reached.')
          }
        }
        else if (part !== '.' && part !== '.') {
          levels.push(part)
        }
      }
    }

    return levels.join('/')
  }


  function suffix(id) {
    return /\.(?:css|js)$/.test(id) ? id : id + '.js'
  }


  /*
   * Resovle id with the version tree
   */
  var rModuleId = /^((?:@[^\/]+\/)?[^\/]+)(?:\/(\d+\.\d+\.\d+[^\/]*))?(?:\/(.*))?$/

  function parseId(id) {
    var m = id.match(rModuleId)
    return { name: m[1], version: m[2], file: m[3] }
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


  /**
   * To match against following uris:
   * - https://example.com/foo.js
   * - http://example.com/bar.js
   * - //example.com/baz.js
   * - /qux/quux.js
   */
  var rUri = /^(?:https?:)?\//

  function parseUri(id) {
    var id = parseMap(id)

    if (rUri.test(id)) return id

    var obj = parseId(id)
    var name = obj.name
    var version = obj.version

    if (name !== pkg.name) {
      // lock is empty if loader.js is loaded separately, e.g.
      // `<script src="/loader.js" data-main="app.js"></script>
      var meta = lock[name][version]
      if (meta.bundle) {
        return baseUrl + resolve(name, version, meta.bundle)
      }
    }

    var url = baseUrl + id
    if (registry[id].parent.id in system.entries) url += '?entry'
    return url
  }


  var MODULE_INIT = 0
  var MODULE_FETCHING = 1
  var MODULE_FETCHED = 2
  var MODULE_LOADED = 3
  var MODULE_ERROR = 4

  /**
   * The Module class
   * @param {string} id
   * @param {Object} opts
   * @param {string[]} opts.deps
   * @param {function} opts.factory
   * @example
   * new Module('jquery/3.3.1/dist/jquery.js')
   * new Module('//g.alicdn.com/alilog/mlog/aplus_v2.js')
   */
  function Module(id, opts) {
    opts = opts || {}
    this.id = id
    this.deps = opts.deps
    this.children = []
    this.factory = opts.factory
    this.exports = {}
    this.status = MODULE_INIT
    registry[id] = this
  }

  var fetching = {}

  Module.prototype.fetch = function() {
    var mod = this

    if (mod.status < MODULE_FETCHING) {
      mod.status = MODULE_FETCHING
      var uri = parseUri(mod.id)
      if (fetching[uri]) return
      fetching[uri] = true
      request(uri, function(err) {
        if (err) mod.status = MODULE_ERROR
        if (mod.status < MODULE_FETCHED) mod.status = MODULE_FETCHED
        mod.uri = uri
        mod.ignite()
      })
    }
  }

  var rWorkerLoader = /^worker-loader[?!]/

  Module.prototype.resolve = function() {
    var mod = this
    var children = mod.children = []

    if (mod.deps) {
      mod.deps.forEach(function(depName) {
        if (rWorkerLoader.test(depName)) return
        var depId = Module.resolve(depName, mod.id)
        children.push(registry[depId] || new Module(depId))
      })
    }

    children.forEach(function(child) {
      if (!child.parent) child.parent = mod
      child.fetch()
    })
  }

  Module.prototype.ignite = function() {
    var allset = true

    for (var id in registry) {
      if (registry[id].status < MODULE_FETCHED) {
        allset = false
        break
      }
    }

    if (allset) {
      for (var id in system.entries) {
        var mod = registry[id]
        clearTimeout(mod.timeout)
        mod.execute()
      }
    }
  }

  Module.prototype.execute = function() {
    var factory = this.factory
    var mod = this
    var context = dirname(mod.id)

    if (mod.status >= MODULE_LOADED) return

    function require(specifier) {
      if (rWorkerLoader.test(specifier)) {
        return workerFactory(context)(specifier.split('!').pop())
      }
      var id = Module.resolve(specifier, mod.id)
      var dep = registry[id]

      if (dep.status < MODULE_FETCHED) {
        throw new Error('Module ' + specifier + ' (' + mod.id + ') is not ready')
      }
      else if (dep.status < MODULE_LOADED) {
        dep.execute()
      }

      return dep.exports
    }

    require.async = importFactory(context)
    require.resolve = function(specifier) {
      return baseUrl + Module.resolve(specifier, mod.id)
    }
    mod.status = MODULE_LOADED

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
   * Module.resolve('react', 'app/1.0.0')
   */
  Module.resolve = function(id, context) {
    if (rUri.test(id)) return id
    if (id.charAt(0) === '.') id = resolve(dirname(context), id)

    // if lock is not configured yet (which happens if the app is a work in progress)
    if (!lock[pkg.name]) return suffix(resolve(pkg.name, pkg.version, id))

    var parent = parseId(context)
    var opts = lock[parent.name][parent.version]

    var mod = parseId(id)
    if (!(mod.name in lock)) {
      mod = { name: pkg.name, version: pkg.version, file: id }
    }
    var name = mod.name
    var version = mod.version
    var map

    if (version) {
      map = lock[name][version]
    }
    if (!version) {
      if (opts && opts.dependencies && (name in opts.dependencies)) {
        version = opts.dependencies[name]
      }
      else if (name == pkg.name) {
        version = pkg.version
      }
    }
    map = lock[name][version]

    var file = mod.file || map.main || 'index.js'
    if (map.alias) file = map.alias[file] || file
    return resolve(name, version, suffix(file))
  }


  function define(id, deps, factory) {
    if (!factory) {
      factory = deps
      deps = []
    }
    id = suffix(id)
    var mod = registry[id] || new Module(id)

    mod.deps = deps
    mod.factory = factory
    mod.status = MODULE_FETCHED
    mod.resolve()
  }

  var importEntryId = 0
  function importFactory(context) {
    return function(specifiers, fn) {
      var entryId = resolve(context, 'import-' + (importEntryId++) + '.js')
      system.entries[entryId] = true
      specifiers = [].concat(specifiers)
      define(entryId, specifiers, function(require) {
        var mods = specifiers.map(require)
        if (fn) fn.apply(null, mods)
      })
      var entry = registry[entryId]
      entry.timeout = setTimeout(function() {
        throw new Error('Ignition timeout ' + specifiers.join(', '))
      }, system.timeout)
      // Try ignite at the first place, which is necessary when the script is inline.
      entry.ignite()
    }
  }

  function workerFactory(context) {
    return function(id) {
      var url = baseUrl + resolve(context, suffix(id))
      return function createWorker() {
        return new Worker([url, 'main'].join(url.indexOf('?') > 0 ? '&' : '?'))
      }
    }
  }

  Object.assign(system, {
    'import': function Porter_import(specifiers, fn) {
      specifiers = [].concat(specifiers).map(function(specifier) {
        var mod = parseId(specifier)
        return suffix(mod.version ? mod.file : specifier)
      })
      importFactory(pkg.name + '/' + pkg.version)(specifiers, fn)
    }
  })

  global.define = define
  global.porter = system

  global.process = {
    env: {
      BROWSER: true,
      NODE_ENV: process.env.NODE_ENV
    }
  }

  /**
   * <script src="/loader.js" data-main="app"></script>
   */
  var currentScript = document.currentScript

  /**
   * This works in IE 6-10
   */
  if (!currentScript) {
    var scripts = document.getElementsByTagName('script')
    for (var i = scripts.length - 1; i >= 0; i--) {
      var script = scripts[i]
      if (script.readyState == 'interactive') {
        currentScript = script
        break
      }
    }
  }

  /**
   * This should only be necessary in IE 11 because it's the only browser that does
   * not support `document.currentScript`, or `script.readyState`.
   */
  if (!currentScript) {
    try {
      currentScript = document.querySelector('script[data-main]')
    } catch (err) {
      // ignored
    }
  }

  if (currentScript) {
    var main = currentScript.getAttribute('data-main')
    if (main) system.import(main)
  }
})(this)
