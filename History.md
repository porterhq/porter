5.1.0 / 2017-12-??
==================

  * New: integrate babel-core to support components and node_modules transformations;
  * New: use opts.transformOnly to white list node_modules to transform, no node_modules will be transformed by default;
  * Fix: parse `require('dir')`s as alias `{ dir: 'dir/index'}` and store them in dependenciesMap;
  * Fix: dependencies in dependenciesMap should be re-visited rather than overriden;


5.0.1 / 2017-08-17
==================

  * Fix: adding screw_ie8 option for UglifyJS.Compressor()


5.0.0 / 2017-07-26
==================

Yet another major release, yay! I highly suspect that the major version number has now surpassed the number of oceanify users. Anyway, here's the breaking changes:

  * Breaking: components needs to be prefixed with package name and version, such as `<script src="/oceanify/5.0.0/index.js"></script>`. In this way components can have versioning also.
  * Breaking: `opts.importConfig` is now renamed to `opts.loaderConfig`
  * Breaking: `opts.self` is now renamed to `opts.serveSelf`
  * Breaking: `opts.base` is now renamed to `opts.paths` and becomes array to support multi-level components directory
  * Breaking: `/import.js` is now renamed to `/loader.js`
  * Breaking: dropped Node.js 4

Here's new features:

  * New: use `opts.mangleExcept` to skip UglifyJS mangling on certain modules.
  * New: use `opts.loaderConfig.system` to skip parsing therefore makes remote loaderConfig loading possible.
  * New: css `@import`s will be handled server side and processed in advance before requests.

There's too much fixes and upgrades that I'd rather not list here. Besides, there will be even more fixes and upgrades for sure.


4.3.2 / 2016-05-16
==================

  * Fix: prefer const
  * Fix: revert usage of destructuring
  * Build: drop support of Node.js below 4
  * Fix: @import at server side for proper import logic


4.3.1 / 2016-01-08
==================

  * Fix: duplicated dependency declaration of istanbul
  * Fix: ez-editor@0.2.6 & oceanify["import"]
  * Fix: don't append leading slash if base is empty
  * Fix: ie8 issues


4.3.0 / 2015-10-15
==================

  * New: add opts.cachePersist
  * Fix: leave charset empty in Content-Type
  * New: support components/preload.js and oceanify.config
  * Fix: sleep a little longer to wait for bin/compileModule.js
  * Fix: pass --harmony to istanbul command


4.2.3 / 2015-09-28
==================

  * Fix: --harmony in shebang does not work on linux


4.2.2 / 2015-09-28
==================

  * Fix: separate compilation of dependencies into independent process
  * New: components/preload.js
  * New: opts.serveSource for debugging with source map


4.2.1 / 2015-09-21
==================

  * Update: allow opts.base to be an array


4.2.0 / 2015-09-10
==================

  * Update: compileComponent with node modules included
  * Docs: comments about functions in jsdoc format, cannot generate
    anything fancy yet.
  * Fix: fix filename in source map when bundling files like
    node_modules/@ali/pebble/node_modules/yen/index.js
  * New: serve assets other than js and css from components too
  * New: proper source map support


4.1.5 / 2015-09-07
==================

  * Fix: do not interfere if response is handled already
  * Docs: fix a syntax error in sample code


4.1.4 / 2015-09-06
==================

  * Fix: removed debug code


4.1.3 / 2015-09-06
==================

  * Fix: fix cacheModule process


4.1.2 / 2015-09-06
==================

  * New: add cache control headers
  * New: add opts.self for use cases like heredoc
  * Update: use autoprefixer@6 instead
  * Docs: refactored Readme


4.1.1 / 2015-09-02
==================

  * Fix: issues found after refactoring of 4.1.0 (fixes #13)


4.1.0 / 2015-08-31
==================

  * Add: support components/stylesheets (fixes #11)
  * Fix: add line break after factory code (fixes #10)
  * Update: drop cmd-util dependency
  * Update: change documentation of compile tasks to reflect latest code
  * Fix: lock ez-editor version in test/example
  * Fix: url of oceanify example
  * Fix: typos in readme


4.0.1 / 2015-08-25
==================

  * Add: require.async support


4.0.0 / 2015-08-19
==================

  * Add homepage of test/example.
  * Drop support of Node 0.10 and 0.11.
  * Expose `.compileModule` and `.compileComponent` instead.
  * Dropped sea.js depedency, use a homebrewed loader instead.
  * With the customized loader, we now support recursive dependencies.
  * And simplified the entry `<script>` as `<script src="/main.js"></script>`.
  * Parse dependencies map automatically.


3.1.1 / 2015-07-15
==================

  * Added alias value check in `.compileAll`
  * Format readme


3.1.0 / 2015-07-10
==================

  * Drafted english readme
  * Expose stripVersion; fixed compileAll for names like @foo/bar
  * Added _compileTree and `npm run cover`
  * Installed bluebird as devDependency for node@0.10 testing
  * Added `oceanify.parseAlias` helper


3.0.2 / 2015-06-10
==================

  * Ignore test and components folder when publishing to npm
  * Fix g.js


3.0.1 / 2015-06-04
==================

  * Fix a typo in the comment of `.compileAll` api


3.0.0 / 2015-05-26
==================

  * Rename to oceanify because the name `golem` as package name is taken.
  * Remove api `compileAll({ base: 'base/path', component: 'component-name', dest: 'public' })`
  * Refactor code base to migrate to be in favor of Promise


2.1.0 / 2015-02-09
==================

  * Add `compileModule` as the specific node_module compiler


2.0.2 / 2015-02-07
==================

  * Fix the regular expression used to white list the module required.


2.0.1 / 2015-01-29
==================

  * Fix g.js for koa


2.0.0 / 2014-10-08
==================

  * Insert version into component id
  * Update footprint of `.compile` and `.compileAll`


1.0.1 / 2014-09-15
==================

  * Fix undefined base when multiple bases are set.


1.0.0 / 2014-09-15
==================

  * Rename to golem
  * Build in node_modules and components as the default bases


0.2.0 / 2014-08-21
==================

  * Add @ali/helmsmen/generator for koa


0.1.5 / 2014-08-07
==================

  * Fix req.path getter


0.1.4 / 2014-08-07
==================

  * Add opts.local to alias certain component to its source folder.
  * Add examples of KISSY & SeaJS
  * Supports KISSY loader


0.1.3 / 2014-07-25
==================

  * Move repo to central/helmsmen


0.1.2 / 2014-07-25
==================

  * Fix opts.base absolute path check in Windows


0.1.1 / 2014-07-23
==================

  * Fix opts.base absolute path check


0.1.0 / 2014-07-22
==================

  * Init repo
  * Implemented basic features
