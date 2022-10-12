---
layout: en
title: Behind the Scenes
---

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

StyleSheets imported with either `@import` in CSS or `import` in JavaScript are both supported, currently PostCSS is used to transpile CSS sources.

```css
@import "cropper/dist/cropper.css";
@import "common.css"

body {
  padding: 50px;
}
```

```js
import './foo.css';
```

CSS Modules is not fully production ready yet because Lightning CSS is used, which handles css nesting in a radical way that doesn't work well with legacy browsers <https://github.com/parcel-bundler/lightningcss/issues/202>

![](https://cdn.yuque.com/__puml/5c1a7b8ae1312893829aaf4f357cdadd.svg)

When browser requests `app.css`:

1. `autoprefixer` transforms the css modules,
2. porter handles the bundling.
