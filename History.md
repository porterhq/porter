1.0.0 / 2018-01-21
==================

Re-branded as Porter.

  * New: integrate babel-core to support components and node_modules transformations;
  * New: use opts.transformOnly to white list node_modules to transform, no node_modules will be transformed by default;
  * Fix: parse `require('dir')`s as alias `{ dir: 'dir/index'}` and store them in dependenciesMap;
  * Fix: dependencies in dependenciesMap should be re-visited rather than overriden;
  * Fix: both `require('foo')` and `require('foo/entry')` can happen in components and node_modules.
  * Fix: cyclic depedencies workaround.
