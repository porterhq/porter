# Porter

[![NPM Downloads](https://img.shields.io/npm/dm/porter.svg?style=flat)](https://www.npmjs.com/package/porter)
[![NPM Version](http://img.shields.io/npm/v/porter.svg?style=flat)](https://www.npmjs.com/package/porter)
[![Build Status](https://travis-ci.org/erzu/porter.svg)](https://travis-ci.org/erzu/porter)

porter is a JS/CSS module loader featuring module transformation on the fly.

## How to

You need a main entry point for your app's JS and/or CSS.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>An Porter Example</title>
  <!-- CSS ENTRY -->
  <link rel="stylesheet" type="text/css" href="/app.css">
</head>
<body>
  <h1>An Porter Example</h1>
  <!-- JAVASCRIPT ENTRY -->
  <script src="/app.js?main"></script>
</body>
</html>
```

In js files, you can use CMD `require` dependencies:

```js
const $ = require('jquery')
const cropper = require('cropper')
```

Or esModule:

```js
 * as React from 'react'
```

And in stylesheets, you can `@import` dependencies too:

```css
@import 'cropper/dist/cropper.css';   /* stylesheets in node_modules */
@import './nav.css';                  /* stylesheets in components */
```

To achieve this, just setup the middleware provided by porter. For Koa:

```js
const koa = require('koa')
const porter = require('@cara/porter')
const app = koa()

// The paths of JS/CSS components
app.use(porter({ paths: 'components' }))
```

For Express:

```js
const express = require('express')
const porter = require('@cara/porter')
const app = express()

// that's it
app.use(porter({ express: true }))
```

When it's time to be production ready, simply run:

```js
const porter = require('@cara/porter')

Promise.all[
  porter.compileAll({ match: 'app.js' }),           // js components and modules
  porter.compileStyleSheets({ match: 'app.css' })   // css files
])
  .catch(function(err) {
    console.error(err.stack)
  })
```

## Options

### `cacheExcept=[]`

To accelerate loading in development mode, Porter will cache node_modules by compiling and bundling them on the fly. You can rule out some of them by passing an array of module names to `cacheExcept` option:

```js
app.use(porter({ cacheExcept: 'mobx' }))
app.use(porter({ cacheExcept: ['mobx', 'react'] }))
```

To turn off the node_modules caching completely, just set `cacheExcept` to `*`:

```js
app.use(porter({ cacheExcept: '*' }))
```

### `cachePersist=true`

porter will not clear the cache (except the ones specified in `cacheExcept` option) by default. Set `cachePersist` to false to make porter clear cache every time it restarts:

```js
app.use(porter({ cachePersist: false }))
```

### `dest='public'`

Porter caches node_modules compilations, js components transformations (if `.babelrc` exists), and stylesheets. Set `dset=other/directory` to store the cache somewhere else:

```js
app.use(porter({ dest: '.porter-cache' }))
```

Some of the cache requires a static serving middleware to work:

- node_modules compilation results,
- components source maps generated after transformation.

For Koa:

```js
app.use(require('koa-static')(path.join(__dirname, 'public')))
app.use(requrie('porter')({ dest: 'public' }))
```

For Express:

```js
app.use(express.static(path.join(__dirname, 'public')))
app.use(requrie('porter')())
```

### `express=false`

`porter()` returns a koa middleware by default. Set `express=true` to get an express middleware instead:

```js
app.use(require('@cara/porter')({ express: true }))
```

### `loaderConfig={}`

There's a loader hidden in Porter which is the magic behind Porter that makes module loading possible. When js entries such as `app.js?main` is requested, Porter will prepend the loader and loader config to the content of the component. See the loader section for detailed information.

### `mangleExcept=[]`

While porter caches node_modules, the code will be bundled and minified with UglifyJS. In rare caces, UglifyJS' name mangling might generate false results, which can be bypassed with `mangleExcept`:

```js
app.use(porter({ mangleExcept: ['react-router'] }))
```

### `paths='components'`

The directory of your components. Multiple paths is allowd. For example, you need to import modules from both the `components` directory of your app and `node_modules/@corp/sharedComponents`:

```js
app.use(porter({
  paths: [ 'components', 'node_modules/@corp/sharedComponents']
}))
```

### `root=process.cwd()`

Normally this option should never be used. Options like `paths` and `dest` are all resolved against `root`. In test cases like `tests/test.index.js` in the source code, we need to change the `root` to `path.join(__dirname, 'test/example')`.

### `serveSource=false`

Porter generates source maps while transforming components, caching node_modules, or compiling the final assets. For content security concerns, the `sourceContents` are removed in the generated source maps and a `sourceRoot` is set instead. In this way, porter won't leak any source code by default. And if you do need source code being fetched by browser, you can simply turn on `serveSource`:

```js
app.use(porter({ serveSource: true }))
// or set it in a more recommended way
app.use(porter({ serveSource: process.env.NODE_ENV == 'development' }))
```

### `transformOnly=[]`

Besides components, Porter can also transform node_modules. Simply put the module names in `transformOnly`:

```js
app.use(porter({ transformOnly: ['some-es6-module'] }))
```

If the module being loaded is listed in `transformOnly`, and a `.babelrc` within the module directory is found, porter will process the module source with babel too, like the way it handles components. Don't forget to install the presets and plugins listed in the module's `.babelrc` .

## Deployment

Oceanfiy provides two static methods for assets precompilation:

- `porter.compileAll()`
- `porter.compileStyleSheets()`

### `.compileAll([options])`

`.compileAll([options])` returns a Promise.

```js
const porter = require('@cara/porter')

// Specify the entry modules
porter.compileAll({ match: 'app.js' })
  .then(function() {
    console.log('done')
  })
  .catch(function(err) {
    console.error(err.stack)
  })

// You can omit the options since they're the defaults.
porter.compileAll()
```

Porter will compile all the components that matches `opts.match`, find their dependencies in `node_modules` directory and compile them too.

You can try the one in [Porter Example](https://github.com/erzu/porter/tree/master/examples/default). Just execute
`npm run precompile`.

### `.compileStyleSheets([options])`

`.compileStyleSheets([options])` returns a Promise.

```js
const porter = require('@cara/porter')

porter.compileStyleSheets({ match: 'app.css' })
  .then(function() {
    console.log('done')
  })
  .catch(function() {
    console.error(err.stack)
  })
```

Currently `.compileStyleSheets` just process the source code with autoprefixer and postcss-import. You gonna need some minification tools like[cssnano](https://github.com/ben-eb/cssnano) to minify the compiled result.


## Behind the Scene

Let's start with `app.js`, which might seems a bit of black magic at the first glance. It is added to the page directly:

```html
<script src="/app.js?main"></script>
```

And suddenly you can write `app.js` as CommonJS or ES Module right away:

```js
const React = require('react')
import mobx from 'mobx'
```

How can browser know where to `require` when executing `main.js`?

### Loader

The secret is, entry components that ends with `?main` (e.g. `app.js?main`) will be prepended with two things before the the actual `app.js` when it's served with Porter:

1. Loader
2. Loader config

You can import `app.js` explicitly if you prefer:

```html
<script src="/loader.js"></script>
<script>porter.import('app')</script>
```

Both way works. To make `app.js` consumable by the Loader, it will be wrapped into Common Module Declaration format on the fly:

```js
define(id, deps, function(require, exports, module) {
  // actual main.js content
})
```

- `id` is deducted from the file path.
- `dependencies` is parsed from the factory code thanks to the [match-require](https://github.com/yiminghe/match-require) module.
- `factory` (the anonymouse function) body is left untouched or transformed with babel depending on whether `.babelrc` exists or not.

If ES Module is preferred, you'll need two things:

1. Put a `.babelrc` file under your components directory.
2. Install the presets or plugins configured in said `.babelrc`.

Back to the Loader, after the wrapped `app.js` is fetched, it won't execute right away. The dependencies need to be resolved first. For relative dependencies (e.g. other components), it's easy to just resolve them against `id`. For external dependencies (in this case, react and mobx), there's more work done by Porter under the hood:

1. Generate a dependencies map by parsing components and node_modules when it initializes,
2. Flatten the dependencies map into a list of modules required (directly or indirectly) by current entry,
3. Config the loader with the list (among other loader config).

Take heredoc's (simplified) node_modules for example:

```bash
➜  heredoc git:(master) ✗ tree node_modules -I "mocha|standard"
node_modules
└── should
    ├── index.js
    ├── node_modules
    │   └── should-type
    │       ├── index.js
    │       └── package.json
    └── package.json
```

It will be flattened into:

```js
{
  "should": {
    "6.0.3": {
      "main": "./lib/should.js",
      "dependencies": {
        "should-type": "0.0.4"
      }
    }
  },
  "should-type": {
    "0.0.4": {}
  }
}
```

The original dependency path `should/should-type` is now at the same level of `should`. There still are `dependencies`, to store the actual version of `should/should-type` required by `should`. Notice this structure supports multiple versions.

### Loader Config

The structure is then put among other options passed to Loader with `porter.config()`:

```js
porter.config({
  "base": "http://localhost:5000",
  "name": "heredoc",
  "version": "1.3.1",
  "main": "index",
  "modules": { ... }
})
```

- `base` is the root path of components and node modules.
- `name`, `version`, and `main` are self-explanatory. They are all extracted from package.json of the app.
- `modules` is the flattened dependencies map.

### Wrap It Up

So here is `app.js?main` expanded:

```js
// GET /loader.js returns both Loader and Loader Config.
;(function() { /* Loader */ })
porter.config({ /* Loader Config */})

// The module definition and the import kick off.
define(id, dependencies, function(require, exports, module) { /* app.js */ })
porter.import('app')
```

Here's the actual interaction between browser and backend:

1. Browser requests `/app.js?main`;
2. Porter prepares the content of `/app.js?main` with Loader, Loader Config, and the wrapped `app.js`;
3. Browser executes the returned `/app.js`, Loader kicks in, cache `app.js` module in registry;
4. Loader resolves the dependencies of `app.js` module;
5. Browser requests the dependencies per Loader's request;
6. Loader executes the factory of `app.js` once all the dependencies are resolved.

### StyleSheets

The stylesheets part is much easier since Porter does not provide a CSS Loader for now. All of the `@import`s are handled at the backend. Take following `app.css` for example:

```css
@import "cropper/dist/cropper.css";
@import "common.css"

body {
  padding: 50px;
}
```

When browser requests `app.css`:

1. `postcss-import` processes all of the `@import`s;
2. `autoprefixer` transforms the bundle;

Voila!
