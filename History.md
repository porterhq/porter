4.4.7 / 2023-02-15
==================

## What's Changed
* refactor: switch packages/porter to typescript by @cyjake in https://github.com/porterhq/porter/pull/203
* fix: @import url() in css modules by @cyjake in https://github.com/porterhq/porter/pull/204


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.4.6...v4.4.7

4.4.6 / 2023-02-01
==================

## What's Changed
* chore: deprecate window.define(id, deps, factory) by @cyjake in https://github.com/porterhq/porter/pull/202


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.4.5...v4.4.6

4.4.5 / 2023-01-13
==================

## What's Changed
* fix: handle package alias properly by @cyjake in https://github.com/porterhq/porter/pull/201


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.4.4...v4.4.5

4.4.4 / 2023-01-05
==================

## What's Changed
* fix: should be able to handle babel.config.cjs by @cyjake in https://github.com/porterhq/porter/pull/200


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.4.3...v4.4.4

4.4.3 / 2023-01-03
==================

## What's Changed
* fix: dynamic glob imports should not be bundled by default by @cyjake in https://github.com/porterhq/porter/pull/199


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.4.2...v4.4.3

4.4.2 / 2022-11-29
==================

## What's Changed
* fix: worker entries in root packet should present in module manifest by @cyjake in https://github.com/porterhq/porter/pull/197
* fix: local environment have different style urls by @cyjake in https://github.com/porterhq/porter/pull/198


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.4.1...v4.4.2

4.4.1 / 2022-11-14
==================

## What's Changed
* fix: ts module source map by @cyjake in https://github.com/porterhq/porter/pull/195
* fix: load css entry (if present) automatically by @cyjake in https://github.com/porterhq/porter/pull/196


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.4.0...v4.4.1

4.4.0 / 2022-11-11
==================

## What's Changed
* fix: dependencies in es module format should be transpiled automatically by @cyjake in https://github.com/porterhq/porter/pull/186
* refactor: replace lerna with npm workspaces by @cyjake in https://github.com/porterhq/porter/pull/185
* feat: transpile typescript code with babel by @cyjake in https://github.com/porterhq/porter/pull/187
* fix: ts module reloading should incrementally parse new dependencies by @cyjake in https://github.com/porterhq/porter/pull/189
* fix: exceptions thrown during wasm loading should bubble up by @cyjake in https://github.com/porterhq/porter/pull/188
* feat: support import.meta.resolve() by @cyjake in https://github.com/porterhq/porter/pull/190
* docs: header style in dark mode with small viewport by @cyjake in https://github.com/porterhq/porter/pull/191
* refactor: move packages/demo-* folders to examples/* by @cyjake in https://github.com/porterhq/porter/pull/192
* fix: import('./中文 non ascii.json') by @cyjake in https://github.com/porterhq/porter/pull/193
* fix: css imports in ts modules need to be restored by @cyjake in https://github.com/porterhq/porter/pull/194


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.3.4...v4.4.0

4.3.0 / 2022-10-18
==================

## What's Changed
* feat: support glob import by @cyjake in https://github.com/porterhq/porter/pull/174
* docs: update packages/porter/Readme.md by @cyjake in https://github.com/porterhq/porter/pull/176
* docs: 添加仓库的和 @cara/porter 包的中文 Readme by @cyjake in https://github.com/porterhq/porter/pull/177
* docs: 完善中文使用文档，支持深色模式 by @cyjake in https://github.com/porterhq/porter/pull/178
* feat: support cache.clean and output.clean by @cyjake in https://github.com/porterhq/porter/pull/179


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.2.14...v4.3.0

4.2.0 / 2022-05-26
==================

## What's Changed
* feat: support import sass & switch to parcel css by @cyjake in https://github.com/porterhq/porter/pull/156
* fix: should reload css bundle when js bundle change by @cyjake in https://github.com/porterhq/porter/pull/157


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.1.1...v4.2.0

4.1.0 / 2022-05-16
==================

## What's Changed
* feat: support generating source maps with sourcesContent by @cyjake in https://github.com/porterhq/porter/pull/153
* feat: support options.source.mappingURL by @cyjake in https://github.com/porterhq/porter/pull/154


**Full Changelog**: https://github.com/porterhq/porter/compare/v4.0.13...v4.1.0

4.0.10 / 2022-04-28
===================

  * fix: Response can only be consumed once in some lower version browsers (#146)

4.0.9 / 2022-04-28
==================

  * fix: add error callback for loadWasm (#145)

4.0.8 / 2022-04-18
==================

  * fix: fallback to response.arrayBuffer() to cope with baxia script (#144)

4.0.7 / 2022-04-14
==================

  * fix: compile fake entries should not cut imports (#143)

4.0.6 / 2022-04-13
==================

  * fix: compiling css bundle with same name js entry (#142)

4.0.5 / 2022-04-13
==================

  * fix: iterate through bundle in breath first order (#141)
  * chore(deps): bump nokogiri from 1.13.3 to 1.13.4 in /docs (#140)

4.0.4 / 2022-04-12
==================

  * fix: import(arbitrary module) (#139)

4.0.3 / 2022-03-17
==================

  * fix: js extensions such as { .jsx, .mjs, .cjs } (#138)
  * chore: fix demo-app path in unit test of cache

4.0.2 / 2022-03-10
==================

  * fix: fake modules might not have dynamicImports initialized (#137)

4.0.1 / 2022-03-09
==================

  * fix: import(unknown) should not trigger bundle request (#136)
  * fix: support import(specifier): Promise<exports> (#135)
  * fix: require.async() & partial support of `import()` (#134)
  * fix: should always fallback to WebAssembly.instantiate(arrayBuffer) (#132)
  * refactor: minimal re-pack during development (#133)

4.0.0 / 2022-02-28
==================

  * feat: support wasm-bindgen --target bundler (#117)
  * feat: options.resolve.fallback (#116)
  * feat: new Porter({ bundle: { async exists(bundle): boolean {} }); (#114)
  * feat: enable uglifyOptions (#113)
  * feat: support camel2DashComponentName and componentCase (#112)
  * feat: support babel.config.js (#96)
  * feat: experimental less support & refactored porter options (#90)
  * feat: (partial) alias support & more radical browser field handling (#90)
  * feat: support requiring css in js modules (#88)
  * fix: const not allowed in strict mode Chrome 40 (#131)
  * fix: should skip uri parsing if mapped result starts with '/' (#128)
  * fix: import "dependency/foo.json" should be bundled as well (#125)
  * fix: wasm/workercompilation minor issues (#124)
  * fix: problems caused by .[contenthash].wasm (#122)
  * fix: require('antd/lib/button').default (#121)
  * fix: named imports in cjs modules (#118)
  * fix: should still prefer custom loaderConfig in proxy mode (#115)
  * fix: intermediate css source map should not have full sourceRoot (#111)
  * fix: override inlineSourceMap option to force source map (#110)
  * fix: 'Last-Modified' accepts ascii string only (#109)
  * fix: traverse lazyloaded dependencies (108)
  * fix: support arbitrary conditional require (#106)
  * fix: lazyloaded dependencies should be manifested (#105)
  * fix: compileEntry() should wait until instance is ready (#104)
  * fix: reload bundles at both root and dependency level (#101)
  * fix: packet reload should take the change up to the root bundles (#100)
  * fix: bundle scope on lazyloaded modules & porter.parseId perf degeneration (#95)
  * fix: should make sure folder specifiers are correctly marked (#94)
  * fix: should drop the './' prefix when normalize file (#93)
  * fix: excluded packets should be compiled when compileAll (#92)
  * fix: ignore dts imports in module dependencies (#91)
  * fix: possible TypeError in packet.compile() (#89)
  * fix: css modules should not be bundled in js bundle (#87)
  * fix: require('heredoc').strip (#85)
  * fix: porter.pack() should ignore incomplete modules (#84)
  * fix: isolated packages should have their dependencies bundled together (#83)
  * fix: isolated packets will have their dependencies bundled together (#82)
  * fix: all of the lazyloaded entries and dependencies should be compiled (#81)
  * fix: source mapping url in bundle results & cache paths (#80)
  * fix: manifest.json should map only the output (#79)
  * fix: dynamicly added dependencies needs pre-obtain check (#77)
  * fix: loading web worker from dependencies & @babel/runtime issue (#72)
  * fix: reloading cyclic module should not cause dead loop (#69)
  * refactor: reduce module check when packing packet (#129)
  * refactor: worker entries should not be bundled with initiators (#127)
  * refactor: simplify Module.resolve() in loader.js (#126)
  * refactor: skip existence check if app.bundle.exists not specified (#123)
  * refactor: throttle bundle.obtain() calls (#107)
  * refactor: extract app.cache as isolated class and replace etag check (#102)
  * refactor: package -> packet (#86)
  * refactor: merge babel plugins & minor fixes about compilation (#78)
  * refactor: entries, preload, and lazyload are served with bundles (#70)
  * refactor: drop the ${name}/${version}/ prefix in application module ids (#68)
  * docs: user guide link in the documentation (#97)
  * chore(deps): bump nokogiri from 1.12.5 to 1.13.3 in /docs (#130)
  * chore: print stub debug log (#103)

3.3.3 / 2021-11-25
==================

  * fix: drop the default autoprefixer & unused dependency (#76)

3.3.2 / 2021-11-24
==================

  * fix: entry check should allow extensions like `.jsx` or `.tsx` too (#75)

3.3.1 / 2021-11-23
==================

  * fix: compilation output of ts entries should be `.js` (#74)

3.3.0 / 2021-09-23
==================

  * feat: TypeScript support (#67)
  * fix: support package folder names like `_@babel_runtime@7.15.4@@babel/runtime` (#59)
  * upgrade: postcss >= 8.2.10 (#58)

3.2.5 / 2021-05-11
==================

  * fix: import.meta.url should be absolute (57)

3.2.4 / 2021-05-11
==================

  * fix: support web worker with worker-loader (temporarily) (#56)

3.2.3 / 2021-03-22
==================

  * fix: `require('./')` & source map of node_modules generated by npminstall (#55)

3.2.2 / 2021-01-13
==================

  * feat: calculate bundle by content (#54)

3.2.1 / 2020-12-22
==================

  * chore: add crossorigin to script for error detection (#53)

3.2.0 / 2020-08-31
==================

  * feat: experimental webassembly support (#52)

3.1.5 / 2020-06-28
==================

  * refactor: trying to simplify mod.family iterator (#51)
  * fix: use instanceOf Module (#50)
  * fix: check child.family fix remote baseUrl

3.1.4 / 2020-06-23
==================

  * fix clean fetching (#49)

3.1.3 / 2020-06-16
==================

  * fix turn off recursive fs.watch if platform is linux (#46)
  * fix source map not found (#45)

3.1.2 / 2019-12-12
==================

  * fix break if babel config were found first (#44)

3.1.0 / 2019-06-26
==================

  * feat: customize postcss plugins with `opts.postcssPlugins` (#43)

3.0.6 / 2019-02-28
==================

  * drop fake module cache once the compile process finished.

3.0.5 / 2019-01-29
==================

  * invalidate dev cache when minify.
  * check if the speficier is mistakenly resolved because of case insensitive filesystem.
  * enable watch/reload no matter the package needs transpile or not (because we always cache in either case)
  * try to purge `/${file}?main` cache if it's the root package

3.0.4 / 2018-12-25
==================

  * reload `opts.preload`ed entries if their dependencies change.

3.0.3 / 2018-12-24
==================

  * rename package bundle entry if the bundle contains dependencies other than itself, e.g. change from `/pixi.js/4.8.4/lib/index.js` to `/pixi.js/4.8.4/~bundle-7745fb29.js`.
  * bump test coverage.
  * drop `/${name}/${version}/foo.json` and `/foo.json` route because it might cause `/package.json` being accessible.

3.0.2 / 2018-12-17
==================

  * fix left out `{ "./foo": "./foo-browser.js" }`, the specifiers in browser field may not have extensions.

3.0.1 / 2018-12-17
==================

  * fix better browserify support with following scenarios tested:
    * brfs
    * `require('stream')`
    * object browser field such as `{ "fs": false, "./foo.js": "./foo-browser.js" }`
    * global
    * `global.process = { browser: true, env }`

3.0.0 / 2018-10-25
==================

  * css and js entries are now cached (and removed at process start) by default, which get invalidated when the entries or their dependencies are changed.
  * upgrade to Babel 7 (`babel-core` => `@babel/core`)

2.2.0 / 2018-10-23
==================

  * feat: cache transpile and minify results with {@link JsModule@cache}
  * dropped opts.cache.except because {@link Porter} no longer caches final js outputs, which is equivalent of `opts.cache.except = *`

2.1.4 / 2018-09-10
==================

  * fix make sure isolated packages have all their versions compiled
  * fix prevent premature module execution

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

  * fix loaderCache should not be shared at application level for it contains package specific data.

2.1.0 / 2018-08-13
==================

  * feat: bundling at large

2.0.2 / 2018-08-07
==================

  * fix close a safari 9 argument shadowing issue with a temporary UglifyJS fork

2.0.1 / 2018-07-30
==================

  * fix `cache.except` now includes `transpile.only`.
  * fix only the packages that require transpilation should not be cached.
  * fix support `export xxx from "xxx"`.
  * fix defer module fetching to make sure packages with cyclic dependencies can be bundled and fetched properly.

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

  * fix custom postcss-import resolve() shall return fpath

1.0.2 / 2018-04-26
==================

  * fix don't match module.require()

1.0.1 / 2018-02-12
==================

  * feat: porter-serve --headless
  * fix allow require components of current app by fullname, such as `require('@cara/demo-component')`

1.0.0 / 2018-02-11
==================

Re-branded as Porter.

  * feat: integrate babel-core to support components and node_modules transformations;
  * feat: use opts.transformOnly to white list `node_modules` to transform, no `node_modules` will be transformed by default;
  * fix parse `require('dir')`s as alias `{ dir: 'dir/index'}` and store them in dependenciesMap;
  * fix dependencies in dependenciesMap should be re-visited rather than overriden;
  * fix both `require('foo')` and `require('foo/entry')` can happen in components and `node_modules`.
  * fix cyclic depedencies workaround.
  * refactor: a unified (and much faster) parsing of dependencies tree;
  * refactor: `compileComponent()`, `compileModule()`, and `compileAll()` with much cleaner logic (though not faster yet);
