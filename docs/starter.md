---
layout: en
title: User Guides
---

## Quick Start

We need two entry points for our app. One for JavaScript and the other for CSS.

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

In `app.js` we can `import` modules:

```js
import React, { useEffect } from 'react';
import Prism from 'prismjs';

export default function App() {
  useEffect(function() {
    Prism.highlightAll()
  }, []);
  return <div />;
}
```

In `app.css`, we can `@import` css dependencies:

```css
@import 'prismjs/themes/prism.css';   /* stylesheets in dependencies */
@import './base.css';                 /* stylesheets in package */
```

The files shall be organized like below.

```bash
➜  demo-cli git:(master) tree -L 2 -I node_modules
.
├── components
│   ├── app.css
│   ├── app.js
│   └── base.css
├── node_modules
│   ├── @cara/porter-cli
│   ├── prismjs
│   ├── react
│   └── react-dom
└── public
    └── index.html
```

We can now start the app with Porter.

```bash
➜  demo-cli git:(master) npm install @cara/porter-cli
➜  demo-cli git:(master) npx porter serve
Server started at 5000
```

The app is now ready at <http://localhost:5000>.

### Basics

### Modules

### Packages

### WebAssembly

## Integrating with Web Frameworks

### Koa / Egg / Chair / Midway

### Express
