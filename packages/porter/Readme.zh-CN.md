# Porter

[![NPM Downloads](https://img.shields.io/npm/dm/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![NPM Version](http://img.shields.io/npm/v/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![codecov](https://codecov.io/gh/porterhq/porter/branch/master/graph/badge.svg?token=9CNWJ1N4T9)](https://codecov.io/gh/porterhq/porter)

[中文版](./Readme.zh-CN.md)

Porter 是一个前端打包构建工具，支持开发者使用 CommonJS 或者 [ES Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import) 开发 Web 应用，支持如下特性：

1. 支持同步或者异步的模块加载方式，可以任意使用 `require()`、`require.async()`、`import`、或者 `import()` 来加载模块，异步加载的模块会自动拆成单独的包；
2. 与 NPM 包基本对应，可以选择按包构建，也可以选择全部合并代码到同步或者异步加载的入口模块；
3. 足够快的依赖解析与编译性能，合理利用编译缓存，生产环境构建性能更易优化。

推荐阅读《[快速上手](https://porterhq.github.io/porter/zh/starter)》和《[帮助手册](https://porterhq.github.io/porter/zh/basics)》。

## 基础配置

> 文本主要介绍 @cara/porter 中间件的用法，如果要了解 @cara/porter-cli，可以访问对应的 NPM 包，或者阅读 [Porter 帮助手册](https://porterhq.github.io/porter)

Porter 提供 Egg、Koa、和 Express 不同格式的中间件：

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

以下面这个目录结构为例，默认可以将前端代码放在 ./components 目录：

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

然后在 `./public/index.html` 引用：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>A Porter Demo</title>
  <!-- CSS 入口模块 -->
  <link rel="stylesheet" type="text/css" href="/app.css">
</head>
<body>
  <h1>A Porter Demo</h1>
  <!-- JavaScript 入口模块 -->
  <script src="/app.js?main"></script>
</body>
</html>
```

> JavaScript 入口模块有个额外的 `?main` 参数，原先有这个是为了告诉 Porter 在打包入口模块时是否把模块加载器 loader.js 包含进去。相应的，下面这两种写法不会包含 loader.js：
>
> ```html
> <!-- entry format 1 -->
> <script src="/loader.js" data-main="app.js"></script>
> <!-- entry format 2 -->
> <script src="/loader.js"></script>
> <script>porter.import('app')</script>
> ```
> 
> 上述写法都不再推荐，直接写 `<script src="/app.js?main"></script>` 就好。

在 JavaScript 代码中，下面这些写法都是支持的，可以加载 NPM 包、CSS、WebAssembly、或者 Web Worker：

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

在 CSS 入口模块中，同样支持 `@import`，并且会在打包阶段处理，将相关内容按照引用顺序合并到一起：

```css
@import "prismjs/themes/prism.css";
@import "./base.css";
```

如果没有编写专门的 CSS 入口模块，但是在 JavaScript 入口模块中又有 `import './foo.css';`，Porter 也会生成对应的 CSS 输出文件，这个处理逻辑与 webpack 的 mini-css-extract-plugin 相仿。默认情况下，此时打包的 app.js 不会自动加载 app.css，需要在 HTML 页面中自行引入。

## 配置项

下面是 Porter 支持的配置项列表：

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

## 构建部署

前端代码经过构建部署之后，生产环境就不需要依赖打包构建工具了。可以使用 `porter.compileAll({ entries })` 方法来执行构建：

```js
const porter = new Porter({
  output: { path: 'dist' },
});

await porter.compileAll({
  entries: ['app.js', 'app.css']
});
```

Porter 会解析入口模块相关依赖，按照下面的打包逻辑输出构建产物：

- Entries are bundled separately, e.g. `entries: ['app.js', 'app2.js']` are compiled into two different bundles.
- Dependencies are bundled per package with internal modules put together, e.g. jQuery gets compiled as `jquery/3.3.1/dist/jquery.4f8208b0.js`.
- Dependencies with multiple entries gets bundled per package as well, e.g. lodash methods will be compiled as `lodash/4.17.10/lodash.36bdcd6d.js`.

- 入口模块会分别打包，例如 `entries: ['app.js', 'app2.js']` 会分别打包成两个文件；
- 默认按照 NPM 包打包依赖，包内部的模块会被打包到一起，例如 jQuery 包含的模块会被打包到 `jquery/3.3.1/dist/jquery.4f8208b0.js`；
- 如果 NPM 包有多个入口模块被引用，会被打包到一起，页面动态加载的时候也只会加载这个包的同一个构建产物，例如 app.js 引用 lodash/throttle、app2.js 引用 lodash/debounce，最终打包的是 `lodash/4.17.10/lodash.36bdcd6d.js`，两个页面都会加载这个构建产物。

以下面这个入口模块为例：

```js
import $ from 'jquery';
import throttle from 'lodash/throttle';
import camelize from 'lodash/camelize';
import util from './util';
// code
```

调用 `porter.compileAll({ entries: ['app.js'] })` 完成后，输出的文件大致如下：

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

也可以选择全部打包到一起，这样只会按照入口模块来输出构建产物：

```js
// default
porter.compileEntry('app.js', { package: true })

// bundle everything
porter.compileEntry('app.js', { all: true })
```

也可以抽取一些公共包，使用 options.preload 或者 options.bundle.exclude 配置都可以实现，详细参考 [Porter 配置文档](https://porterhq.github.io/porter/zh/options)。
