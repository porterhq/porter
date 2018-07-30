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
