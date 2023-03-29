---
layout: en
title: Command Line Interface
---

## Table of Contents
{:.no_toc}

1. Table of Contents
{:toc}

## Usage

Install @cara/porter-cli with following command:

```bash
$ npm install @cara/porter-cli -g
```

which will be available at the global bin directory, /usr/local/bin on macOS, then starting the service like:

```bash
$ porter serve
Server started at http://localhost:3000
```

The package can be installed and used locally as well:

```bash
$ npm install @cara/porter-cli --save-dev
$ npx porter serve
Server started at http://localhost:3000
```

### Web Application

A typical web application setup would be like:

```bash
➜  examples/cli git:(master) tree -L 2
.
├── components        # browser modules
│   ├── app.css
│   └── app.js
├── node_modules      # dependencies
│   ├── @cara
│   ├── jquery
│   └── prismjs
├── package.json
└── public
    └── index.html    # homepage
```

### Web Component

The components directory can be omitted if unnecessary, which is quite common when developing web components:

```bash
➜  examples/component git:(master) tree . -I node_modules
.
├── index.js
├── package.json
└── test
    └── suite.js
```

The paths need to be set to `.`:

```bash
$ porter serve --paths .
Server started at http://localhost:3000
```

Please look into [examples/component](https://github.com/porterhq/porter/tree/master/examples/component) for more information.

### Deployment

```bash
$ porter build --paths web entry1.js entry2.js ...
```
