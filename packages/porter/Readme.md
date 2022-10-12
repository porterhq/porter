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

With the default setup, browser modules at `./components` folder is now accessible with `/path/to/file.js`. Take [demo-cli](https://github.com/porterhq/porter/tree/master/packages/demo-cli) for example, the file structure shall resemble that of below:

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
  <title>A Porter Demo</title>
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

> The extra `?main` parameter in the JavaScript entry query is added for historical reasons. It tells the porter middleware to include loader.js when bundling app.js, which isn't necessary if loader.js is included explicitly:
>
> ```html
> <!-- entry format 1 -->
> <script src="/loader.js" data-main="app.js"></script>
> <!-- entry format 2 -->
> <script src="/loader.js"></script>
> <script>porter.import('app')</script>
> ```
> 
> Both formats are no longer recommended, please use `<script src="/app.js?main"></script>` directly.

In JavaScript entry, all kinds of imports are supported:

```js
import $ from 'jquery';         // => ./node_modules/jquery/dist/jquery.js
import * as React from 'react'; // => ./node_modules/react/index.js
import util from './util';      // => ./components/util.js or ./components/util/index.js

// <link rel="stylesheet" type="text/css" href="/app.js"> is still needed though
import './foo.css';

// will fetch the wasm file, instantiate it, and return the exports
import wasm from './foo.wasm';

// will bundle and fetch worker.js separately 
import Worker from 'worker-loader!./worker.js';
```

In CSS entry, there's `@import`:

```css
@import "prismjs/themes/prism.css";
@import "./base.css";
```

## Options

In a nutshell, here is the list of porter options:

```javascript
const path = require('path');
const Porter = require('@cara/porter');

const porter = new Porter({
  // project root, defaults to `process.cwd()`
  root: process.cwd(),
  
  // paths of browser modules, or components, defaults to `'components'`
  paths: 'components',
  
  // output settings
  output: {
    // path of the compile output, defaults to `'public'`
    path: 'public',
  },
  
  // cache settings
  cache: {
    // path of the cache store, defaults to `output.path`
		path: '.porter-cache',
    
    // cache identifier to shortcut cache invalidation
    identifier({ packet }) {
      return JSON.stringify([
        require('@cara/porter/package.json').version,
				packet.transpiler,
				packet.transpilerVersion,
				packet.transpilerOpts,
      ]);
    },
  },
  
  // preload common dependencies, defaults to `[]`
  preload: [ 'preload', '@babel/runtime' ],
  
  // the module resolution behaviour
  resolve: {
    // an alias at project level to simplify import specifier, such as
    //     import util from '@/util'; // => components/util/index.js
    alias: {
      '@': path.join(process.cwd(), 'components'),
    },
    
    // supported extensions
    extensions: [ '*', '.js', '.jsx', '.ts', '.tsx', '.css' ],
    
		// transform big libraries that support partial import by conventions
    import: [
      { libraryName: 'antd', style: 'css' },
      { libraryName: 'lodash', 
        libraryDirectory: '', 
        camel2DashComponentName: false },
    ],
  },
  
  // transpile settings
  transpile: {
    // turn on transpilation on certain dependencies, defaults to `[]`
    include: [ 'antd' ],
  },
  
  // bundle settings
  bundle: {
    // excluded dependencies will be bundled separately, defaults to `[]`
    exclude: [ 'antd' ],
  },
  
  // source settings
  source: {
    // serve the source file if it's development mode, defaults to `false`
    serve: process.env.NODE_ENV !== 'production',
    
    // the `sourceRoot` in the generated source map, defaults to `'/'`
    root: 'localhost:3000',
  },
});
```

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
