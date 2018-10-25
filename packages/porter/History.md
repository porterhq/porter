3.0.0 / 2018-10-25
==================

  * css and js entries are now cached (and removed at process start) by default, which get invalidated when the entries or their dependencies are changed.
  * upgrade to Babel 7 (`babel-core` => `@babel/core`)

2.2.0 / 2018-10-23
==================

  * New: cache transpile and minify results with {@link JsModule@cache}
  * dropped opts.cache.except because {@link Porter} no longer caches final js outputs, which is equivalent of `opts.cache.except = *`

2.1.4 / 2018-09-10
==================

  * Fix: make sure isolated packages have all their versions compiled
  * Fix: prevent premature module execution

2.1.3 / 2018-08-30
==================

  * fix: css module parsing
  * fix: await next()

2.1.2 / 2018-08-20
==================

  * fix preload bundling, porter now tries its best to skip preloaded packages when bundling entries
  * fix multiple porter.lock assignment, only entries can now assign porter.lock
  * fix minor regression issues since favoring bundling
  * switch to `watch => reload` for better development experience
  * dropped opts.persist since it's no longer necessary

2.1.1 / 2018-08-14
==================

  * Fix: loaderCache should not be shared at application level for it contains package specific data.

2.1.0 / 2018-08-13
==================

  * New: bundling at large

2.0.2 / 2018-08-07
==================

  * Fix: close a safari 9 argument shadowing issue with a temporary UglifyJS fork

2.0.1 / 2018-07-30
==================

  * Fix: `cache.except` now includes `transpile.only`.
  * Fix: only the packages that require transpilation should not be cached.
  * Fix: support `export xxx from "xxx"`.
  * Fix: defer module fetching to make sure packages with cyclic dependencies can be bundled and fetched properly.

2.0.0 / 2018-06-21
==================

  * Instant module resolution.
  * Package bundling on the fly.
  * Automatic bundling (${name}/${version}/~bundle.js) on packages that have multiple entries, such as lodash and fbjs.
  * Support `require("worker-loader!foo)` to migrate existing code.
  * Proper require.resolve to new Worker(require.resolve('foo')), which is basically the same as `require("worker-loader!foo")` except that `foo.js` has its own bundle.
  * TypeScript support.

1.0.3 / 2018-05-10
==================

  * Fix: custom postcss-import resolve() shall return fpath

1.0.2 / 2018-04-26
==================

  * Fix: don't match module.require()

1.0.1 / 2018-02-12
==================

  * Fix: allow require components of current app by fullname, such as `require('@cara/porter-component')`

1.0.0 / 2018-02-11
==================

Re-branded as Porter.

  * Refactor: a unified (and much faster) parsing of dependencies tree;
  * Refactor: `compileComponent()`, `compileModule()`, and `compileAll()` with much cleaner logic (though not faster yet);
  * New: integrate babel-core to support components and node_modules transformations;
  * New: use opts.transformOnly to white list `node_modules` to transform, no `node_modules` will be transformed by default;
  * Fix: parse `require('dir')`s as alias `{ dir: 'dir/index'}` and store them in dependenciesMap;
  * Fix: dependencies in dependenciesMap should be re-visited rather than overriden;
  * Fix: both `require('foo')` and `require('foo/entry')` can happen in components and `node_modules`.
  * Fix: cyclic depedencies workaround.
