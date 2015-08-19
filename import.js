/* eslint-env browser */
/* eslint-disable semi-spacing, strict */
(function(global) {

  var registry = {}
  var system = { base: '' }


  var ArrayFn = Array.prototype

  if (!Object.assign) {
    Object.assign = function() {
      var args = ArrayFn.slice.call(arguments)
      var target = args.shift()

      while (args.length) {
        var source = args.shift()

        for (var p in source) {
          if (source.hasOwnProperty(p)) {
            target[p] = source[p]
          }
        }
      }
    }
  }


  var doc = document
  var head = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement
  var baseElement = head.getElementsByTagName('base')[0]

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
      el.onreadystatechange = function() {
        if (/loaded|complete/.test(el.readyState)) {
          callback()
        } else {
          callback(new Error('Failed with wrong state ' + el.readyState))
        }
      }
    }
  }


  var RE_DIRNAME = /([^?#]*)\//
  var RE_DUPLICATED_SLASH = /([^:])\/\/+/g

  function dirname(fpath) {
    var m = fpath.match(RE_DIRNAME)
    return m ? m[1] : '.'
  }

  function resolve() {
    var args = ArrayFn.slice.call(arguments)
    var levels = args.shift().split('/')

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
        else {
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


  var MODULE_INIT = 0
  var MODULE_FETCHING = 1
  var MODULE_FETCHED = 2
  var MODULE_RESOLVING = 3
  var MODULE_RESOLVED = 4
  var MODULE_EXECUTING = 5
  var MODULE_EXECUTED = 6
  var MODULE_ERROR = 7


  function Module(id, opts) {
    opts = opts || {}
    this.id = id
    this.dependencies = opts.dependencies
    this.dependents = []
    this.factory = opts.factory
    this.status = MODULE_INIT

    registry[id] = this
  }

  Module.prototype.fetch = function() {
    var mod = this

    if (mod.status < MODULE_FETCHING) {
      mod.status = MODULE_FETCHING
      request(resolve(system.base, mod.id + '.js'), function(err) {
        if (err) {
          mod.status = MODULE_ERROR
        } else {
          mod.resolve()
        }
      })
    }
  }

  Module.prototype.resolve = function() {
    var mod = this
    var deps = mod.dependencies

    mod.status = MODULE_RESOLVING

    for (var i = 0, len = deps.length; i < len; i++) {
      var depName = deps[i]
      var depId = Module.resolve(depName, mod.id)
      var dep = registry[depId] || new Module(depId)

      dep.fetch()
      dep.dependents.push(mod)

      /*
       * If the dependencies were bundled with current module, then when current
       * module kicks off the resolve process, the dependencies will be fetched.
       * Let's just continue the resolve process.
       */
      if (dep.status === MODULE_FETCHED) {
        dep.resolve()
      }
    }

    /*
     * No more dependencies to resolve. Let's get the back track started.
     */
    if (deps.length === 0) mod.resolved()
  }

  Module.prototype.resolved = function() {
    var mod = this
    var dependents = mod.dependents

    if (mod.status < MODULE_RESOLVED) {
      mod.status = MODULE_RESOLVED
    }

    // entrance
    if (mod.id === system.import) {
      mod.execute()
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

    mod.status = MODULE_EXECUTING
    mod.exports = {}

    var exports = typeof factory === 'function'
      ? factory.call(mod.exports, require, mod.exports, mod)
      : factory

    if (exports) {
      mod.exports = exports
    }

    mod.status = MODULE_EXECUTED
  }


  Module.resolve = function(id, context) {
    var map = system.modules

    if (!map || !context) return id

    if (id.charAt(0) === '.') {
      return resolve(dirname(context), id)
    }

    var deps = system.dependencies
    var parent = parseId(context)

    if (parent.name in map) {
      deps = map[parent.name][parent.version].dependencies
    }

    var relative = parseId(id)

    if (relative.name in deps) {
      var name = relative.name
      var version = deps[name]
      var entry = relative.entry || map[name][version].main || 'index'

      return resolve(name, version, entry.replace(/\.js$/, ''))
    }
    else {
      return id
    }
  }


  global.define = function define(id, deps, factory) {
    if (!factory) {
      factory = deps
      deps = []
    }

    var mod = registry[id] || new Module(id)

    mod.dependencies = deps
    mod.factory = factory
    mod.status = MODULE_FETCHED

    if (id === 'system') {
      mod.resolve()
      mod.execute()
      Object.assign(system, mod.exports)
    }
  }

  global.registry = registry
  global.system = system


  function bootstrap() {
    var scripts = doc.scripts || doc.getElementsByTagName('script')
    var currentScript = scripts[scripts.length - 1]
    var parts = currentScript.src.split('/')

    for (var i = 0, len = parts.length; i < len; i++) {
      if (/^(?:app|imports|main|runner)\b/.test(parts[i])) {
        system.base = parts.slice(0, i).join('/')
        system.import = parts.slice(i).join('/').replace(/\.js$/, '')
      }
    }

    onload(currentScript, function() {
      var id = Module.resolve(system.import)
      registry[id].resolve()
    })
  }

  bootstrap()

})(this)
