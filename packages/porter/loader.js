/* eslint-env browser */
/* eslint-disable semi-spacing, strict */
(function(global) {

  // do not override
  if (global.porter) return;

  var arrayFn = Array.prototype;

  if (!Object.assign) {
    Object.assign = function() {
      var args = arrayFn.slice.call(arguments);
      var target = args.shift();

      while (args.length) {
        var source = args.shift();

        for (var p in source) {
          if (source != null) {
            if (source.hasOwnProperty(p)) {
              target[p] = source[p];
            }
          }
        }
      }

      return target;
    };
  }

  var system = { lock: {}, registry: {}, entries: {}, preload: [] };
  Object.assign(system, process.env.loaderConfig);
  var lock = system.lock;
  var registry = system.registry;
  var preload = system.preload;
  var basePath = system.baseUrl.replace(/([^\/])$/, '$1/');
  var baseUrl = new URL(basePath, location.origin).toString();
  var pkg = system.package;
  var alias = system.alias;

  function onload(el, callback) {
    if ('onload' in el) {
      el.onload = function() {
        callback();
      };
      el.onerror = function(cause) {
        var err = new Error('Failed to fetch ' + el.src);
        err.cause = cause;
        callback(err);
      };
    }
    else {
      // get called multiple times
      // https://msdn.microsoft.com/en-us/library/ms534359(v=vs.85).aspx
      el.onreadystatechange = function() {
        if (/loaded|complete/.test(el.readyState)) {
          callback();
        }
      };
    }
  }

  var requestScript;
  var requestStyle;
  var rCss = /\.css$/;
  var rWasm = /\.wasm$/;
  var rJson = /\.json$/;
  var rExt = /(\.\w+)$/;
  var rDigest = /\.[0-9a-f]{8}(\.\w+)$/;

  if (typeof importScripts === 'function') {
    /* eslint-env worker */
    requestScript = function loadScript(url, callback) {
      try {
        importScripts(url);
      } catch (err) {
        return callback(err);
      }
      callback();
    };
    requestStyle = function loadStyle(url, callback) {
      callback();
    };
  }
  else {
    var doc = document;
    var head = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement;
    var baseElement = head.getElementsByTagName('base')[0] || null;
    requestScript = function loadScript(url, callback) {
      var el = doc.createElement('script');

      onload(el, function(err) {
        el = el.onload = el.onerror = el.onreadystatechange = null;
        // head.removeChild(el)
        callback(err);
      });
      el.async = true;
      el.src = url;
      el.crossOrigin = '';

      // baseElement cannot be undefined in IE8-.
      head.insertBefore(el, baseElement);
    };
    requestStyle = function loadStyle(url, callback) {
      // http://localhost:3000/foo/bar.e8572fb4.css -> /foo/bar.css
      var localUrl = url.replace(baseUrl, system.baseUrl).replace(rDigest, '$1');
      var selectors = '[href="' + url + '"], [href="' + localUrl + '"]';
      if (typeof importScripts === 'function' || !rDigest.test(url) || doc.querySelector(selectors)) {
        callback();
        return;
      }
      var el = doc.createElement('link');
      el.rel = 'stylesheet';
      el.href = url;
      onload(el, function(err) {
        el = el.onload = el.onerror = el.onreadystatechange = null;
        callback(err);
      });
      head.insertBefore(el, baseElement);
    };
  }

  function _loadWasm(module, imports) {
    return module.arrayBuffer().then(function instantiate(bytes) {
      return WebAssembly.instantiate(bytes, imports);
    }).then(function onInstantiate(instance) {
      if (instance instanceof WebAssembly.Instance) return { instance, module };
      return instance;
    });
  }

  function loadWasm(module, imports) {
    if (typeof WebAssembly.instantiateStreaming === 'function') {
      return WebAssembly.instantiateStreaming(module.clone(), imports).catch(function onError(err) {
        if (module.headers.get('Content-Type') != 'application/wasm') {
          console.warn('`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n', err);
        } else {
          // some script might override window.Response which fails instantiateStreaming
          return _loadWasm(module, imports);
        }
      });
    }
    return _loadWasm(module, imports);
  }

  function requestWasm(url, callback) {
    var id = url.replace(baseUrl, '').replace(rDigest, '$1');
    var mod = registry[id];
    var contextId = id.replace(rWasm, '.js');
    var context = registry[contextId];
    if (!context) throw new Error('context module of ' + url + ' not found');

    // loader.js might be required to run in legacy browser hence async/await not used
    fetch(new URL(url, location.origin))
      .then(function onResponse(module) {
        // execute context module factory for the first time to grab the imports
        // FIXME: context might not be ready to execute if the packet weren't bundled
        context.execute();

        // prepare the imports of wasm module
        var imports = {};
        imports['./' + contextId.split('/').pop()] = context.exports;
        return loadWasm(module, imports);
      })
      .then(function onLoad(result) {
        var instance = result.instance;
        // exports of wasm module are finally ready
        Object.assign(mod.exports, instance.exports);
        // ignite the wasm module to execute context module for the second time
        callback();
      })
      .catch(function onError(err) {
        callback(err);
      });
  }

  function request(url, callback) {
    if (rWasm.test(url)) {
      requestWasm(url, callback);
    } else if (rCss.test(url)) {
      requestStyle(url, callback);
    } else {
      requestScript(url, callback);
    }
  }

  /*
   * resolve paths
   */
  var rDirname = /([^?#]*)\//;

  function dirname(fpath) {
    var m = fpath.match(rDirname);
    return m ? m[1] : '.';
  }

  function resolve() {
    var args = arrayFn.slice.call(arguments);
    var levels = [];
    var i = 0;

    // trimStart
    while (args[i] === '') i++;

    while (i < args.length) {
      var parts = args[i++].split('/');
      var j = 0;
      while (j < parts.length) {
        var part = parts[j++];
        if (part === '..') {
          if (levels.length) {
            levels.pop();
          } else {
            throw new Error('Top level reached.');
          }
        }
        else if (part !== '.' && part !== '.') {
          levels.push(part);
        }
      }
    }

    return levels.join('/');
  }


  function suffix(id) {
    if (id.slice(-1) == '/') return id + 'index.js';
    id = id.replace(/\.(?:jsx?|tsx?|mjs|cjs)$/, '.js').replace(/\.(?:less|sass|scss)$/, '.css');
    return /\.(?:css|js|json|wasm)$/.test(id) ? id : id + '.js';
  }


  /*
   * Resovle id with the version tree
   */
  var rModuleId = /^((?:@[^\/]+\/)?[^\/]+)(?:\/(\d+\.\d+\.\d+[^\/]*))?(?:\/(.*))?$/;

  function parseId(id) {
    var m = id.match(rModuleId);
    return { name: m[1], version: m[2], file: m[3] };
  }


  function parseMap(url) {
    var map = system.map;
    var ret = url;

    if (map) {
      for (var pattern in map) {
        ret = url.replace(new RegExp('^' + pattern), map[pattern]);
        // Only apply the first matched rule
        if (ret !== url) break;
      }
    }

    return ret;
  }


  /**
   * To match against following urls:
   * - https://example.com/foo.js
   * - http://example.com/bar.js
   * - //example.com/baz.js
   * - /qux/quux.js
   */
  var rUrl = /^(?:https?:)?\//;

  function parseUrl(id) {
    var id = parseMap(id);
    // https://example.com/foo.js
    if (rUrl.test(id)) return id;

    var mod = registry[id];
    var isRootEntry = !mod || !mod.parent || (mod.parent.id in system.entries);
    var obj = parseId(id);
    var name = obj.name;
    var version = obj.version;

    if (!version && pkg.name in lock) {
      var meta = lock[pkg.name][pkg.version];
      return baseUrl + (meta.manifest && meta.manifest[id] || id);
    }

    // lock is empty if loader.js is loaded separately, e.g.
    // `<script src="/loader.js" data-main="app.js"></script>`
    if (name in lock) {
      var meta = lock[name][version];
      var file = isRootEntry || rWasm.test(obj.file) || rCss.test(obj.file) ? obj.file : (meta.main || 'index.js');
      if (meta.manifest && meta.manifest[file]) {
        return baseUrl + resolve(name, version, meta.manifest[file]);
      }
    }

    var url = baseUrl + id;
    if (isRootEntry) url += '?entry';
    return url;
  }

  var MODULE_INIT = 0;
  var MODULE_FETCHING = 1;
  var MODULE_FETCHED = 2;
  var MODULE_LOADED = 3;
  var MODULE_ERROR = 4;

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
    opts = opts || {};
    this.id = id;
    this.deps = opts.deps;
    this.children = [];
    this.factory = opts.factory;
    this.exports = rWasm.test(id) ? { __esModule: true } : {};
    this.status = MODULE_INIT;
    this.meta = {
      url: parseUrl(baseUrl + id),
      resolve: function(specifier) {
        var result = Module.resolve(specifier, id);
        return result ? parseUrl(baseUrl + result) : '';
      },
    };
    registry[id] = this;
  }

  var fetching = {};
  var predefineModules = [];

  function cacheDefine(id, deps, factory) {
    predefineModules.push([id, deps, factory]);
  }

  function swapDefine() {
    for (var i = 0; i < predefineModules.length; i++) {
      define.apply(null, predefineModules[i]);
    }
    predefineModules = [];
    global.define = define;
    for (var name in system.entries) {
      var mod = registry[name];
      mod.status = MODULE_FETCHED;
      mod.ignite();
    }
  }

  function importError(specifiers) {
    var message = 'import(' + JSON.stringify(specifiers) + ') timeout';
    var pendingModules = [];
    for (var id in registry) {
      var mod = registry[id];
      if (mod.status < MODULE_FETCHED) pendingModules.push(id);
    }
    if (pendingModules.length > 0) {
      message += ' for pending modules (' + JSON.stringify(pendingModules) + ')';
    }
    return new Error(message);
  }

  Module.prototype.fetch = function() {
    var mod = this;

    if (predefineModules.length > 0) {
      for (var i = 0; i < predefineModules.length; i++) {
        if (predefineModules[i][0] == mod.id) {
          mod.status = MODULE_FETCHED;
        }
      }
    }

    if (mod.status < MODULE_FETCHING) {
      mod.status = MODULE_FETCHING;
      var url = parseUrl(mod.id);
      function onFetch(err) {
        if (err) mod.status = MODULE_ERROR;
        if (mod.status < MODULE_FETCHED) mod.status = MODULE_FETCHED;
        mod.url = url;
        mod.ignite();
        // throw fetch error anyway, which can be caught by web monitors with window.onerror
        if (err) throw err;
      }
      if (fetching[url]) {
        fetching[url].push(onFetch);
        return;
      }
      fetching[url] = [onFetch];
      request(url, function(err) {
        var callbacks = fetching[url];
        for (var j = 0; j < callbacks.length; j++) callbacks[j](err);
        fetching[url] = null;
      });
    }
  };

  var rWorkerLoader = /^worker-loader[?!]/;

  Module.prototype.resolve = function() {
    var mod = this;
    var children = mod.children = [];

    if (mod.deps) {
      mod.deps.forEach(function(depName) {
        if (rWorkerLoader.test(depName)) return;
        var depId = Module.resolve(depName, mod.id);
        if (depId) children.push(registry[depId] || new Module(depId));
      });
    }

    children.forEach(function(child) {
      if (!child.parent) child.parent = mod;
      setTimeout(function() {
        child.fetch();
      }, 0);
    });
  };

  Module.prototype.ignite = function() {
    var allset = true;

    for (var id in registry) {
      if (registry[id].status < MODULE_FETCHED) {
        allset = false;
        break;
      }
    }

    if (allset && predefineModules.length > 0) {
      swapDefine();
      return this.ignite();
    }

    if (allset) {
      // a copy of entry ids is needed because `mod.execute()` might update `system.entries`
      var ids = Object.keys(system.entries);
      for (var i = 0; i < ids.length; i++) {
        var mod = registry[ids[i]];
        clearTimeout(mod.timeout);
        mod.execute();
      }
    }
  };

  Module.prototype.execute = function() {
    var factory = this.factory;
    var mod = this;
    var context = dirname(mod.id);

    if (mod.status >= MODULE_LOADED) return;

    function require(specifier) {
      if (rWorkerLoader.test(specifier)) {
        return workerFactory(context)(specifier.split('!').pop());
      }
      var id = Module.resolve(specifier, mod.id);
      // module might be turned off on purpose with `{ foo: false }` in browser field.
      if (!id) return {};
      var dep = registry[id];

      // foo.e7b6121c.js
      if (!dep && rDigest.test(parseUrl(id)) && typeof Promise === 'function') {
        // eslint-disable-next-line no-shadow
        return Object.assign(new Promise(function(resolve, reject) {
          require.async(specifier, function(exports) {
            if (exports.__esModule) return resolve(exports);
            if (rJson.test(id)) return resolve({ default: exports });
            resolve(Object.assign({ default: exports }, exports));
          });
          setTimeout(function() {
            reject(importError(specifier));
          }, system.timeout);
        }), { __esModule: true });
      }

      // should ignore if still unknown
      if (!dep) return {};

      // wasm module has no factory
      if (rWasm.test(id)) return dep.exports;

      if (dep.status < MODULE_FETCHED) {
        throw new Error('Module ' + specifier + ' (' + mod.id + ') is not ready');
      }
      else if (dep.status < MODULE_LOADED) {
        dep.execute();
      }

      return dep.exports;
    }

    require.async = importFactory(context);
    require.resolve = function(specifier) {
      return basePath + Module.resolve(specifier, mod.id);
    };
    mod.status = MODULE_LOADED;

    // function(require, exports, module, __module) {}
    var exports = typeof factory === 'function'
      ? factory.call(null, require, mod.exports, mod, mod)
      : factory;

    if (exports) mod.exports = exports;
  };

  /**
   * @param {string} specifier
   * @param {string} context
   * @example
   * Module.resolve('./lib/foo', 'app/1.0.0/home')
   * Module.resolve('lib/foo', 'app/1.0.0/home')
   * Module.resolve('react', 'app/1.0.0')
   */
  Module.resolve = function(specifier, context) {
    if (rUrl.test(specifier)) return specifier;

    // if lock is not configured yet (which happens if the app is a work in progress)
    if (!lock[pkg.name]) return suffix(specifier);

    var parent = parseId(context);
    var parentMap = parent.version
      ? lock[parent.name][parent.version]
      : lock[pkg.name][pkg.version];

    if (!parent.version) {
      for (var key in alias) {
        if (specifier.indexOf(key) === 0) {
          specifier = alias[key] + specifier.slice(key.length);
          break;
        }
      }
    }

    if (parentMap.browser) {
      var mapped = parentMap.browser[specifier];
      if (mapped === false) return '';
      if (mapped) specifier = mapped;
    }

    var id = specifier.charAt(0) == '.'
      ? resolve(dirname(context), specifier)
      : specifier;
    var mod = parseId(id);
    var name = mod.name;
    var version = mod.version;
    var file = mod.file;

    if (!version) {
      if (parentMap && parentMap.dependencies && (name in parentMap.dependencies)) {
        // import dependency
        version = parentMap.dependencies[name];
      } else if (name === pkg.name) {
        // import itself as dependency, see demo-components/test/suite.js
        version = pkg.version;
      } else {
        // import itself by file
        name = pkg.name;
        version = pkg.version;
        file = id;
      }
    }

    var map = lock[name][version];
    file = file ||  map.main || 'index.js';

    if (map.browser) {
      var result = map.browser['./' + file];
      if (result === undefined) result = map.browser['./' + file + '.js'];
      if (result === false) return '';
      if (typeof result === 'string') file = result;
    }
    if (map.folder && map.folder[file]) file += '/index.js';

    file = suffix(file);
    // root entry might still in id format when loading web worker from dependencies
    return name !== pkg.name || mod.version ? resolve(name, version, file) : file;
  };


  function define(id, deps, factory) {
    if (!factory) {
      factory = deps;
      deps = [];
    }
    id = suffix(id);
    var mod = registry[id] || new Module(id);
    mod.deps = deps;
    mod.factory = factory;
    // in case the script is accidentally loaded multiple times
    if (mod.status < MODULE_FETCHED) mod.status = MODULE_FETCHED;
    mod.resolve();
  }

  var importEntryId = 0;
  function importFactory(context) {
    return function(specifiers, fn) {
      var entryId = resolve(context, 'import-' + (importEntryId++) + '.js');
      specifiers = [].concat(specifiers);
      for (var i = 0, len = specifiers.length; i < len; i++) {
        var specifier = specifiers[i];
        // foo.d41d8cd9.css might exists
        var cssEntry = Module.resolve(specifier, entryId).replace(rExt, '.css');
        if (rDigest.test(parseUrl(cssEntry))) specifiers.push(cssEntry);
      }
      system.entries[entryId] = true;
      define(entryId, specifiers, function(require) {
        var mods = specifiers.map(require);
        if (fn) fn.apply(null, mods);
      });
      var entry = registry[entryId];
      entry.timeout = setTimeout(function() {
        throw importError(specifiers);
      }, system.timeout);
      // Try ignite at the first place, which is necessary when the script is inline.
      entry.ignite();
    };
  }

  function workerFactory(context) {
    return function(id) {
      var url = new URL(parseUrl(resolve(context, suffix(id))));
      return function createWorker() {
        url.searchParams.set('main', '');
        var blob = new Blob([ 'importScripts("' + url.toString() + '")' ], {
          type: 'application/javascript',
        });
        return new Worker(URL.createObjectURL(blob), { credentials: 'same-origin' });
      };
    };
  }

  var rootImport = importFactory('');

  Object.assign(system, {
    'import': function Porter_import(specifiers, fn) {
      specifiers = preload.concat(specifiers).map(function(specifier) {
        return suffix(specifier);
      });
      rootImport(specifiers, function() {
        if (fn) fn.apply(null, arrayFn.slice.call(arguments, preload.length));
      });
    },
    merge: function Porter_merge(target, source) {
      if (source == null || target == null) return target;
      if (typeof source !== 'object' || typeof target !== 'object') return target;
      for (var key in source) {
        if (!source.hasOwnProperty(key)) continue;
        var value = source[key];
        if (value == null || typeof value !== 'object' || target[key] == null || typeof target[key] !== 'object') {
          target[key] = value;
        } else {
          Porter_merge(target[key], value);
        }
      }
      return target;
    },
  });

  global.define = preload.length > 0 ? cacheDefine : define;
  global.porter = system;

  global.process = {
    browser: true,
    env: {
      BROWSER: true,
      NODE_ENV: process.env.NODE_ENV
    }
  };

  // certain browserify style packages' use global instead of window for better inter-op
  global.global = global;

  if (global.document) {
    /**
     * <script src="/loader.js" data-main="app"></script>
     */
    var currentScript = document.currentScript;

    /**
     * This should only be necessary in IE 11 because it's the only browser that does
     * not support `document.currentScript`, or `script.readyState`.
     */
    if (!currentScript) {
      try {
        currentScript = document.querySelector('script[data-main]');
      } catch (err) {
        // ignored
      }
    }

    if (currentScript) {
      var main = currentScript.getAttribute('data-main');
      if (main) system['import'](main);
    }
  }
})(this);
