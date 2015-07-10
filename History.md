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
