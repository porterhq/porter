# Porter

[![NPM Downloads](https://img.shields.io/npm/dm/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![NPM Version](http://img.shields.io/npm/v/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![codecov](https://codecov.io/gh/porterhq/porter/branch/master/graph/badge.svg?token=9CNWJ1N4T9)](https://codecov.io/gh/porterhq/porter)

Porter is a **consolidated browser module solution** which provides a module system for web browsers that is both CommonJS and [ES Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import) compatible.

Here are the features that make Porter different from (if not better than) other module solutions:

1. Both synchronous and asynchronous module loading are supported. `import` is transformed with either Babel or TypeScript. `import()` is not fully supported yet but there's an equivalent `require.async(specifier, mod => {})` provided.
2. Implemented with the concept `Module` (file) and `Package` (directory with package.json and files) built-in.
3. Fast enough module resolution and transpilation that makes the `watch => bundle` loop unnecessary. With Porter the middleware, `.css` and `.js` requests are intercepted (and processed if changed) correspondingly.

## Setup

> This document is mainly about Porter the middleware. To learn about Porter CLI, please visit the [corresponding folder](https://github.com/porterhq/porter/packages/porter-cli).

Porter the middleware is compatible with Koa (both major versions) and Express:

```js
const Koa = require('koa')
const Porter = require('@cara/porter')

const app = new Koa()
const porter = new Porter()
app.use(porter.async())

// express
app.use(porter.func())
```

## Modules

With the default setup, browser modules at `./components` folder is now accessible with `/path/to/file.js` or `/${pkg.name}/${pkg.version}/path/to/file.js`. Take [demo-cli](https://github.com/porterhq/porter/packages/demo-cli) for example, the file structure shall resemble that of below:

```bash
➜  demo-cli git:(master) tree -L 2
.
├── components        # browser modules
│   ├── app.css
│   └── app.js
├── node_modules      # dependencies
│   ├── @cara
│   │   └── porter
│   ├── jquery
│   └── prismjs
├── package.json
└── public
    └── index.html    # homepage
```

In `./public/index.html`, we can now add CSS and JavaScript entries:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>An Porter Demo</title>
  <!-- CSS entry -->
  <link rel="stylesheet" type="text/css" href="/app.css">
</head>
<body>
  <h1>A Porter Demo</h1>
  <!-- JavaScript entry -->
  <script src="/app.js?main"></script>
</body>
</html>
```

The extra `?main` querystring might seem a bit confusing at first glance. It tells the porter middleware to bundle loader when `/app.js?main` is accessed. The equivalent `<script>` entry of above is:

```html
<script src="/loader.js" data-main="app.js"></script>
```

Both `<script>`s work as the JavaScript entry of current page. In `./components/app.js`, there are the good old `require` and `exports`:

```js
import $ from 'jquery';         // => ./node_modules/jquery/dist/jquery.js
import * as React from 'react'; // => ./node_modules/react/index.js
import util from './util';      // => ./components/util.js or ./components/util/index.js
```

In CSS entry, there's `@import`:

```css
@import "prismjs/themes/prism.css";
@import "./base.css";
```

## Options

<https://www.yuque.com/porterhq/porter/fitqkz>

## Deployment

It is possible (and also recommended) to disable Porter in production, as long as the assets are compiled with `porter.compileAll()`. To compile assets of the project, simply call `porter.compileAll({ entries })`:

```js
const porter = new Porter()

porter.compileAll({
  entries: ['app.js', 'app.css']
})
  .then(() => console.log('done')
  .catch(err => console.error(err.stack))
```

Porter will compile entries and their dependencies, bundle them together afterwards. How the modules are bundled is a simple yet complicated question. Here's the default bundling strategy:

- Entries are bundled separately, e.g. `entries: ['app.js', 'app2.js']` are compiled into two different bundles.
- Dependencies are bundled per package with internal modules put together, e.g. jQuery gets compiled as `jquery/3.3.1/dist/jquery.js`.
- Dependencies with multiple entries gets bundled per package as well, e.g. lodash methods will be compiled as `lodash/4.17.10/~bundle-36bdcd6d.js`.

Assume the root package is:

```json
{
  "name": "@cara/demo-cli",
  "version": "2.0.0"
}
```

and the content of `./components/app.js` is:

```js
'use strict'

const $ = require('jquery')
const throttle = require('lodash/throttle')
const camelize = require('lodash/camelize')
const util = require('./util')

// code
```

After `porter.compileAll({ entries: ['app.js'] })`, the files in `./public` should be:

```bash
public
├── app.${contenthash}.js
├── app.${contenthash}.js.map
├── jquery
│   └── 3.3.1
│       └── dist
|           ├── jquery.${contenthash}.js
|           └── jquery.${contenthash}.js.map
└── lodash
    └── 4.17.10
        ├── ~bundle.${contenthash}.js
        └── ~bundle.${contenthash}.js.map
```

For different kinds of projects, different strategies shall be employed. We can tell Porter to bundle dependencies at certain scope with `porter.compileEntry()`:

```js
// default
porter.compileEntry('app.js', { package: true })

// bundle everything
porter.compileEntry('app.js', { all: true })
```

## Behind the Scene

Let's start with `app.js`, which might seem a bit confusing at the first glance. It is added to the page directly:

```html
<script src="/app.js?main"></script>
```

And suddenly you can write `app.js` as Node.js Modules or ES Modules right away:

```js
import mobx from 'mobx'
const React = require('react')
```

How can browser know where to `import` MobX or `require` React when executing `app.js`?

### Loader

The secret is, entries that has `main` in the querystring (e.g. `app.js?main`) will be prepended with two things before the the actual `app.js` when it's served with Porter:

1. Loader
2. Package lock

You can import `app.js` explicitly if you prefer:

```html
<script src="/loader.js"></script>
<script>porter.import('app')</script>
<!-- or with shortcut -->
<script src="/loader.js" data-main="app"></script>
```

Both way works. To make `app.js` consumable by the Loader, it will be wrapped into Common Module Declaration format on the fly:

```js
define(id, deps, function(require, exports, module) {
  // actual main.js content
});
```

- `id` is deducted from the file path.
- `dependencies` is parsed from the factory code with [js-tokens](https://github.com/lydell/js-tokens).
- `factory` (the anonymouse function) body is left untouched or transformed with babel depending on whether `.babelrc` exists or not.

If ES Module is preferred, you'll need two things:

1. Put a `.babelrc` file under your components directory.
2. Install the presets or plugins configured in said `.babelrc`.

Back to the Loader, after the wrapped `app.js` is fetched, it won't execute right away. The dependencies need to be resolved first. For relative dependencies (e.g. dependencies within the same package), it's easy to just resolve them against `module.id`. For external dependencies (in this case, react and mobx), `node_modules` are looked.

The parsed dependencies is in two trees, one for modules (file by file), one for packages (folder by folder). When the entry module (e.g. `app.js`) is accessed, a package lock is generated and prepended before the module to make sure the correct module path is used.

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

### Loader Config

Besides package lock, there're several basic loader settings (which are all configurable while `new Porter()`):

| property  | description |
|-----------|-------------|
| `baseUrl` | root path of the browser modules, e.g. `https://staticfile.org/`      |
| `map`     | module mappings that may interfere module resolution                  |
| `package` | metadata of the root package, e.g. `{ name, version, main, entries }` |
| `preload` | a syntax sugar for quick loading certain files before entry           |

In development phase, Porter configs the loader with following settings:

```js
{
  baseUrl: '/',
  package: { /* generated from package.json of the project */ }
}
```

### Wrap It Up

So here is `app.js?main` expanded:

```js
// GET /loader.js returns both Loader and Loader Config.
;(function() { /* Loader */ })
Object.assign(porter.lock, /* package lock */)

// The module definition and the import kick off.
define(id, dependencies, function(require, exports, module) { /* app.js */ })
porter.import('app')
```

Here's the actual interaction between browser and Porter:

![](https://cdn.yuque.com/__puml/76189ffa06e35b64edd55c3e9423734d.svg)

### StyleSheets

The stylesheets part is much easier since Porter processes CSS `@import`s at the first place. Take following `app.css` for example:

```css
@import "cropper/dist/cropper.css";
@import "common.css"

body {
  padding: 50px;
}
```

![](https://cdn.yuque.com/__puml/5c1a7b8ae1312893829aaf4f357cdadd.svg)

When browser requests `app.css`:

1. `postcss-import` processes all of the `@import`s;
2. `autoprefixer` transforms the bundle;

Porter then responses with the processed CSS (which has all `@import`s replaced with actual file contents).
