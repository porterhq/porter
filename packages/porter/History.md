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
