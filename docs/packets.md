---
layout: en
title: Packets
---

## Table of Contents
{:.no_toc}

1. Table of Contents
{:toc}

## Usage

The Packet in Porter is an internal entity that reflects the NPM package, which is responsible for following tasks:

- parsing the relevant fields in package.json, such as module, browser, or main;
- processing the browser field, mostly extended by browserify, that might have object values to alias specifiers;
- and detecting compiler configurations to determine the packet needs transformntion or not.

We can transpile packets explicitly with the transpile.include option, and split the packet out of the entry bundle with the bundle.exclude option:

```js
new Porter({
  transpile: {
    include: ['antd'],
  },
  bundle: {
    exclude: ['antd'],
  },
});
```

The source code within node_modules/antd will be transpiled and splitted into separate bundle, like `antd/${version}/lib/index.${contenthash}.js`
