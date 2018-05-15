[![NPM Downloads](https://img.shields.io/npm/dm/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![NPM Version](http://img.shields.io/npm/v/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![Build Status](https://travis-ci.org/erzu/porter.svg)](https://travis-ci.org/erzu/porter)

Porter is **a consolidated browser module solution** which provides a module system for web browsers that is both Node.js Modules and ES Modules compatible.

## How to

We need two entry points for our app. One for JavaScript and the other for CSS.

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

In `app.js` we can `require` modules:

```js
const Prism = require('prismjs')
Prism.highlightAll()
```

or `import` ES Modules (with Babel or TypeScript enabled):

```js
import * as React from 'react'
```

In `app.css`, we can `@import` css dependencies:

```css
@import 'prismjs/themes/prism.css';   /* stylesheets in dependencies */
@import './base.css';                 /* stylesheets in package */
```

The files shall be organized like below.

```bash
➜  porter-demo git:(master) tree -L 2 -I node_modules
.
├── components
│   ├── app.css
│   ├── app.js
│   └── base.css
└── public
    └── index.html
```

We can now start the app with Porter.

```bash
➜  porter-demo git:(master) npx porter serve
Server started at 5000
```

The app is now ready at <http://localhost:5000>.

## Packages

Porter consists of two major packages, [porter](https://github.com/erzu/porter/tree/master/packages/porter) the middleware and [porter-cli](https://github.com/erzu/porter/tree/master/packages/porter-cli) the command line interface. These are the two packages we publish to NPM.

The rest of the packages are mostly for demo or test purpose. For users interested in porter-cli,

- porter-component may be referenced as a demo of using porter-cli to develop a browser module.
- porter-demo may be referenced as a demo of using porter-cli to develop a web application.

As of porter-app, users interested in porter the middleware may take the `app.js` in porter-app for example. Many options of porter the middleware, and edge cases of browser modules in NPM, are tested in porter-app. Pardon if you find the code within porter-app a bit messy.
