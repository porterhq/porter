---
layout: en
title: Modules
---

## Table of Contents
{:.no_toc}

1. Table of Contents
{:toc}

## JavaScript Modules

Both ES Modules and CommonJS are supported, the former one is recommended, yet the latter one is still supported to help migrating legacy projects to Porter:

```js
// will be transform into `requrie('lodash/debounce')` if `require.import` configured
import { throttle } from 'lodash';
// will be transform as well if `require.import` configured
const { debounce } = require('lodash');
```

Both formats will be transformed into an intermediate format like below:

```js
define('foo/bar.js', ['./baz', 'react'], function(require, exports, module) {
  // original CommonJS source
  // or ES Modules transformed code
});
```

### interop

When ES Modules and CommonJS were used interchangeably, please be noted that interop wrappings are not added to `require()`, such as:

```js
// card.jsx
export default function Card(props) {
  return <div></div>;
}

// app.js
// ----
// this works by default
import Card from './card';
// this is like using import('./card'), exports.default is not aliased
const { default: Card } = require('./card');
```

### transform

File extensions like .js, .jsx, .mjs, and .cjs are supported by default. If Babel configuration were not found, will fallback to SWC to transform .jsx and .mjs at least.

Some syntax sugars that went slightly beyond tc39 are supported as well, such as:

```js
// like the glob import in vite
const files = import.meta.glob('./data/*.json', { eager: true });

// using module url to resolve worker url
const worker = new Worker(new URL('./worker.js', import.meta.url));

// long text declaration like heredoc in bash,
// will be transformed into string literal
const text = heredoc(function() {/*
  <!doctype html>
  <html>
    <head></head>
    <body></body>
  </html>
*/});
```

### import.meta.glob

### import.meta.url

This might be the only property of [import.meta](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import.meta) that is available in browser, which returns the URL of current module.

```js
const url = new URL('./hello.wasm', import.meta.url);
const result = await WebAssembly.instantiate(url);
result.instance.exports.greet('wasm');
```

If you were using wasm-bindgen to write wasm packages, actually you can [import wasm]({{ '/wasm' | relative_url }}) directly.

### heredoc

long text declared with heredoc will be transformed into string literal, with the dependency removed. For example:

```js
import heredoc from 'heredoc';
const text = heredoc(function() {/*
  <!doctype html>
  <html>
    <head></head>
    <body></body>
  </html>
*/});
```

the code above will be transformed into something like below:

```js
const text = `<!doctype html>
<html>
  <head></head>
  <body></body>
</html>`;
```

If the linebreaks are not necessary as well, just declare it as oneline:

```js
const text = heredoc(function(oneline) {/*
  <!doctype html>
  <html>
    <head></head>
    <body></body>
  </html>
*/});
```

will be transformed as:

```js
const text = `<!doctype html><html><head></head><body></body></html>`;
```

## JSON Modules

JSON modules can be imported directly, such as:

```js
import a from './data/a.json';
console.loa(a);
```

The transformed PorterJS module would be like below:

```js
define('data/a.json', { ...data });
define('app.js', ['./data/a.json'], function(require) {
  const a = interop(require('./data/a.json'));
  console.log(a);
});
```

## TypeScript Modules

TypeScript modules are treated by the same compiler of JavaScript modules, which means the compiler would be Babel or SWC, and all of the features we talked about in JavaScript modules, are available as well.

Because neither Babel nor SWC does type checks when compiling TypeScript, these kind of flags won't be raised when

## CSS Modules

Both vanilla CSS and the fancy twin CSS Modules are supported, the latter one will take place if the file name ends with .module.css

For vanilla CSS entries, in Porter we can either `<link>` them directly,

```html
<link rel="stylesheet" href="app.css">
```

or import them in JavaScript:

```js
// dialog.js
import './dialog.css';
export default function Dialog() {}

// app.js
import Dialog from './dialog';
import './app.css';
```

The bundled app.css will contain CSS dependencies found in the dependency graph, and retain the order in DFS algorithm. The equivalent CSS of above would be:

```css
@import './dialog.css';
@import './app.css';
```

### .module.css

As of the CSS modules, we can use them like below:

```js
import styles from './app.module.css';
function App() {
  return <div className={styles.container}></div>;
}
```

One thing to be noted is that CSS modules will be handled with Lightning CSS rather than the default PostCSS, which means the transformed CSS might vary, and might share [narrower browser compatibility](https://github.com/parcel-bundler/lightningcss/issues/202).

## Less Modules

File extensions like .less will be first transformed with Less.js, then treated just like CSS modules. The path resolver is extended a bit to support specifiers starting with `~`:

```css
@import '~cropper/dist/cropper.css';
```

Specifiers starting with `~` will be searched by looking into node_modules, with the leading `~` trimmed of course. In Porter, it is ok to omit the leading `~`, which means the code below works the same:

```css
@import 'cropper/dist/cropper.css';
```

## Sass Modules

File extensions like .sass and .scss will be treated as Sass modules, which will be transformed with the official compiler available at <https://sass-lang.com/>.

Extended file extensions like .module.sass and .module.scss will have their exports too, just like CSS Modules:

```js
import styles from './foo.scss';
function App {
  return <div className={styles.app} />
}
```

## WebAssembly modules

Please read the dedicated documentation of [WebAssembly]({{ '/wasm' | relative_url }})
