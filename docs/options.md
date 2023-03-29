---
layout: en
title: Options
---

## Table of Contents
{:.no_toc}

1. Table of Contents
{:toc}

## Overview

```javascript
const path = require('path');
const Porter = require('@cara/porter');

const porter = new Porter({
  // project root, defaults to `process.cwd()`
  root: process.cwd(),

  // paths of browser modules, or components, defaults to `'components'`
  paths: 'components',

  output: {
    path: 'public',

    // whether or not to clear cache before compilation
    cache: false,
  },

  cache: {
    path: 'node_modules/.porter-cache',

    // cache version identifier, mostly related to Porter, compiler, or minifier options
    identifier({ packet, uglifyOptions }) {
      return JSON.stringify([
        require('@cara/porter/package.json').version,
        packet.transpiler,
        packet.transpilerVersion,
        packet.transpilerOpts,
        uglifyOptions,
      ]);
    },

    // whether or not to clear cache at start
    clean: false,
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

## root: string

The project root, defaults to `process.cwd()`, which should not be necessary to set. If set to other paths, project configuration files such as package.json, .babelrc, or .swcrc will be resolved from the new root.

## paths: string | string[]

The source directories of the web application, defaults to `components`, which can be one or multiple directories. The paths will be resolved from the project root, which means the source directory is default to `${process.cwd()}/components`.

If multiple paths present, they'll be looked into one by one when resolving module specifiers, the front one takes precedence.


```javascript
new Porter({
  paths: [ 'components', 'node_modules/shared-componnets' ],
});
```

## preload: string | string[]

Somewhat like the common chunk in webpack, useful to bundle common dependencies, which will be loaded before executing entry module. It can be configured like below:

```javascript
new Porter({
  preload: 'preload',
  /* preload: [ 'preload', '@babel/runtime' ], */
});
```

with following content as example:

```javascript
// components/preload.js
import 'react';
import 'react-dom';
import 'mobx';
```

To separate certain packets from the default bundle, please refer to the `bundle.exclude` option.

## output: {}

### output.path: string

The output path is default to `${process.cwd()}/public `, which can be changed with:

```javascript
new Porter({
  output: { path: 'dist' },
});
```

## resolve: {}

### resolve.alias: {}

The resolve.alias option works like the browser field in package.json, which maps the module specifier before handing it over to the resolver to look into filesystem:

```javascript
new Porter({
  resolve: {
    alias: {
      '@/': '',         // 将 `@/` 映射到前端代码根目录
      'Util/': 'util/', // 讲 `Util/` 映射到 util/ 目录
    },
  },
});
```

If multiple source paths were provided, the aliased module speicifer will still be searched in those paths from the start. For example, if source paths are app/web and isomorphic, we can configure it like below:

```javascript
new Porter({
  resolve: {
    alias: { '@/': '' },
  },
  paths: [ 'app/web', 'isomorphic' ],
});
```

When resolving `import '@/foo'`, following files will be searched:

1. app/web/foo.js
2. app/web/foo/index.js
3. isomorphic/foo.js
4. isomorphic/foo/index.js

### resolve.extensions: string[]

The file extensiosn to search when resolve module specifier, defaults to `[ '*', '.js', '.jsx', '.ts', '.tsx' ]`. To search more file extensions, such as `.cjs` or `.mjs`, please specify them like below:

```javascript
new Porter({
  resolve: {
    extensions: [ '*', '.js', '.jsx', '.cjs', '.mjs' ],
  },
});
```

`resolve.extensions` will be tried one by one if the specifier doesn't provide a default one. It is recommended to name the extension when importing dependencies, such as `import './foo.json'`.

### resolve.import: ImportOption[]

This option works like babel-plugin-import. It is re-implemented in Porter because not all of the modules were processed with Babel. Since the switch to SWC, this feature might be refactored, but the `resolve.import` option will still remain like below:

```javascript
new Porter({
  resolve: {
    import: [
      { libraryName: 'antd', style: true },
      { libraryName: 'lodash', libraryDirectory: '', camel2DashComponentName: false },
    ],
  },
});
```

## transpile: {}

代码编译相关配置主要在 `transpile` 配置项下面，主要配置 Porter 的编译开关，对编辑逻辑本身的配置沿用具体编译器的配置方式。例如，如果项目用的是 Babel，在项目根目录或者前端代码根目录放一个 .babelrc 文件即可。如果项目用的 TypeScript，配置文件改成 tsconfig.json。

Porter 计划未来迁移到性能更好的通用编译器 swc，届时可能对这部分配置方式作调整。

### transpile.include: string[]

在默认情况下，Porter 会编译 `paths` 中所有的代码，但是会忽略所有 node_modules。如果应用需要适配的浏览器范围比较大，有的时候还需要给一些外部依赖也开启编译，比如给只提供 es modules 的 p-all：

```javascript
new Porter({
  transpile: {
    include: [ 'p-all' ],
  },
});
```

对于那些提供编译后的代码，但是模块声明方式是 es modules 的依赖，同样需要开启配置。

## bundle: {}

配置 Porter 的打包行为，是否合并依赖，合并依赖的时候是否拆分某些依赖，等等。目前 Porter 有关“是否合并依赖”的开关是隐含的，如果应用开启 preload，则除了 preload 的部分，会默认将依赖都合并到入口模块中。未来这部分配置也将单独开放，或者提供自定义函数来控制依赖合并逻辑。

### bundle.exclude: string[]

在合并模式开启的时候，如果某些依赖比较大（比如 antd、react、react-dom、或者 moment），可以将它们单独拆出来，从而减少打包时间，提高前端资源的利用率：

```javascript
new Porter({
  bundle: {
    exclude: [ 'antd', 'react', 'react-dom' ],
  },
});
```

### bundle.exists(): Promise<boolean>

打包的时候用来判断对应的包是否已经存在，如果已经存在，则跳过对应的打包操作（主要是合并模块代码、生成 Source Map）。需要传入 `AsyncFunction`，便于结合远端缓存比如 OSS 或者 CDN 判断，类似：

```javascript
const porter = new Porter({
  bundle: {
    async exists(bundle) {
      const ossClient = new OSS({ ...options });
      return await ossClient.head(bundle.outputPath);
    },
  },
});
```
跳过合并的包仍然会在构建完成后保存的 manifest.json 中有记录，便于应用查找。

## cache: {}

缓存相关配置，包含缓存路径，缓存是否失效的快速判断参数等。Porter 在编译模块代码时会使用缓存，如果对应模块已经编译过，就直接用编译后的版本。目前代码编译和压缩的缓存是在一起的，因此在应用上线阶段也可以用这个缓存大幅优化打包编译时间。

### cache.path: string

缓存存储路径，默认与 `output.path` 相同，在 v4.x 正式版本中可能调整为 .porter-cache 或者 node_modules/.cache/porter 之类的路径，以避免缓存数据被一起上传到 CDN，例如：

```javascript
new Porter({
  cache: { path: 'node_modules/.cache/porter' },
});
```

### cache.identifier: ({ packet: Packet }) => string

缓存标识的计算逻辑，默认为：

```javascript
new Porter({
  cache: {
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
});
```

## source

Source Map 相关配置，默认情况下 Porter 不会将源码生成到 Source Map 文件中，即移除掉 sourcesContent 属性，让浏览器通过 sourceRoot 和 sources 属性自行请求源码。

### source.serve: true

Whether or not to let Porter serve the source files as well. This should never be positive in production, and is not enabled by default since Porter v4.x

```javascript
new Porter({
  source: {
    serve: process.env.NODE_ENV === 'development',
  },
});
```

### source.root: string

The root of the source contents, defaults to `/`:

```javascript
new Porter({
  source: {
    root: 'https://some.where/that/holds/the/source',
  },
});
```

It is convenient that shipping source maps in production with source contents stripped and stored elsewhere, preferably with specific ACL.

## postcssPlugins: PostcssPlugin[]

Porter uses PostCSS to process CSS modules, extra PostCSS plugins can be specified like below:

```javascript
new Porter({
  postcssPlugins: [
    autoprefixer(),
    cssnano(),
  ],
});
```

## uglifyOptions: {}

Porter uses UglifyJS or SWC to compress the output. Sometimes the output still needs to retain class names or function names if features like decorators were used, which can be enabled like below:

```js
new Porter({
  uglifyOptions: {
    // keep_fnames: true,
    keep_fnames: /path\/to\/module/,
  },
});
