---
layout: en
title: Migrating to SWC
---

## Table of Contents
{:.no_toc}

1. Table of Contents
{:toc}

## Overview

Starting with Porter v4.6, projects can switch the compiler of JavaScript (and TypeScript) to [SWC](https://swc.rs). Comparing with the Babel + UglifyJS duo, the performance improvement is quite promising:

|  | porter v3.x | porter v4.0.x | porter v.4.6.x | porter v4.6.x (m1) |
| --- | --- | --- | --- | --- |
| w/ cache | 00:05:00.145 | 00:03:55.166 | 00:02:50.812 | 00:02:13.685 |
| w/o cache | 00:09:09.613 | 00:09:07.572 | 00:04:31.296 | 00:02:34.915 |

> 1. The records in the table are the elapsed time of compiling a project that have 300,000 lines of JavaScript or TypeScript, and nearly 10,000 lines of CSS（not including the dependencies such as React and related components);
> 2. v3.x was tested almost a year ago, the scale of the project were smaller.

v4.6 still has following optimizations going on:

- [x] new dependencies might be added after transform (such as @babel/runtime, @swc/helpers, or tslib), currently Porter will parse the result code another time to process those dependencies thoroughly, which might be possible to omit this parsing phase by adding a new module type to SWC transform;
- [ ] the compile all precedure might generate same bundle multiple times. though optimized with bundle.exists() already, this still slows down the process.
- [ ] some steps can be performed concurrently.

We can swith to SWC with environment variable:

```bash
$ SWC=true npx porter serve .
```

or the dedicated swc option:

```js
const porter = new Proter({ swc: true });
```

## Why the PorterJs module Type

```js
swc.transform({
  jsc: { ... },
  module: {
    type: 'porterjs', // 新增的模块类型
    moduleId,
  },
});
```

首先要回答的是为什么需要在 SWC 增加一个新的模块类型，在社区流行的格式标准目前有 ES Module、CommonJS、AMD、UMD、以及 SystemJS，这些在 SWC 中均有支持，但都和 Porter 所需要使用的格式有些许出入：

Currently SWC supports ES Module, CommonJS, AMD, UMD, and SystemJS as the targeted module type. For the reasons below, Porter can't depend one of them directly:

- ES Module needs morden browsers, and give or take few more years, we might be able to ship the app simply with rollup + importMap, using ES Module as the underlying format. But considering the browsers Porter needs to support, sadly not today;
- CommonJS needs the injection of require, exports, and modle, with specific module resolution algorithm. This format is actually the one Porter uses, with few glue code;
- AMD fits the browser, but with the require behavior modified that differs to CommonJS a lot;
- UMD mixes CommonJS and AMD, hence shares the same concerns as above;
- SystemJS works for SystemJS

Before switching to SWC, the module transportation in Porter is like below:

```js
// source code
import Foo from './foo';
export function createFoo() {
  return new Foo();
}
```

which will be transformed into CommonJS code like below:

```js
const Foo = require('./foo');
exports.createFoo = function() {
  return new Foo();
}
```

then wrapped with glue code to declare the module id, dependencies, and the module itself:

```js
porter.define(`{moduleId}`, ["./foo"], function(require, exports) {
  const Foo = require('./foo');
  exports.createFoo = function() {
    return new Foo();
  }
});
```

This format looks a lot like AMD, with the major difference in the rqeuire behavior, which is synchronous rather than async:

```js
require('./foo', (foo) => { ... });
```

Then the wrapped module is handed over to UglifyJS to minify, with the require, exports, and module, be compressed correctly. Now that we've got SWC to merge these two phase, we'll need SWC to do the wrapping as well.

## envify

Besides the dependencies parsing and wrapping, the PorterJS module type would also:

- No matter the program is module or script, the require calls will be collected to merge them into the dependency list;
- No matter the process minifies the code or not, conditional requires in envify fashion will be pruned to omit unnecessary dependencies.

For example, following code:

```js
import Foo from './foo';
require('./bar')(Foo);
```

will be transformed into code like below, with both ./foo and ./bar listed as dependencies:

```js
porter.define(`{moduleId}`, ["./foo", "./bar"], function(require) {
  const Foo = require('./foo');
  require('./bar')(Foo);
});
```

As of the envify conditional require, we can take react for example:

```js
'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/react.production.min.js');
} else {
  module.exports = require('./cjs/react.development.js');
}
```

which will be turned into code like below

```js
porter.define([
    "./cjs/react.development.js",
    "./a.browser.js"
], function(require, exports, module) {
    'use strict';
    if (process.env.NODE_ENV === 'production') {} else {
        module.exports = require('./cjs/react.development.js');
    }
});
```
