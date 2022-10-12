---
layout: zh
title: 配置项
---

## 目录
{:.no_toc}

1. 目录
{:toc}

## 概览

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

## root: string

项目根路径，一般不需要设置，默认为 `process.cwd()`。如果设置为其他值，package.json、.babelrc、tsconfig.json 等配置信息均已设置的值为准。

## paths: string | string[]

前端代码所在路径，默认为 components，可以设置为其他字符串，或者包含多个字符串的数组。传入的路径将基于项目根路径解析，即默认代码所在路径为 `${process.cwd()}/components`。

如果传入多个值，将按顺序查找模块，如果不同目录中存在同名模块，靠前目录中的模块会生效：
```javascript
new Porter({
  paths: [ 'components', 'node_modules/shared-componnets' ],
});
```

## preload: string | string[]
类似 webpack 的 common，用来配置应用的公共依赖，会在执行入口代码之前加载，例如：
```javascript
new Porter({
  preload: 'preload',
  /* preload: [ 'preload', '@babel/runtime' ], */
});
```

可以在对应的 components/preload.js 文件中编排需要提取的公共依赖，比如：
```javascript
// components/preload.js
import 'react';
import 'react-dom';
import 'mobx';

// 按需引用的工具库不应该全量引入，而是在 options.preload 配置项中额外配置
// import '@babel/runtime';
```

一些比较大的依赖比如 react、react-dom，也可以选择拆成单独的构建产物，参考 `bundle.exclude` 配置项

## output: {}

构建产物相关配置

### output.path: string
构建产物的保存路径默认为 public，可以通过 `output.path` 调整路径：
```javascript
new Porter({
  output: { path: 'dist' },
});
```

## resolve: {}

模块路径解析相关配置

### resolve.alias: {}

模块别名，可以通过此配置项将 import specifier 映射为其他文件名，目前只支持同一包内的文件名转换：
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

如果项目配置了多个源码目录，映射后的名称仍然会在多个目录中查找。例如，如果项目前端代码分为 app/web、isomorphic 两个目录，前者存放纯前端代码，后者是前后端同构代码，我们将项目配置如下：

```javascript
new Porter({
  resolve: { 
    alias: { '@/': '' },
  },
  paths: [ 'app/web', 'isomorphic' ],
});
```
在遇到 `import '@/foo'` 时，Porter 将在这两个目录依次查找 foo.js 或者 foo/index.js 文件。

### resolve.extensions: string[]

查找依赖时所支持的扩展名，默认为 `[ '*', '.js', '.jsx', '.ts', '.tsx', '.css' ]`。如果项目需要使用 Less，并且没有使用 TypeScript，可以调整扩展名为：

```javascript
new Porter({
  resolve: {
    extensions: [ '*', '.js', '.jsx', '.css', '.less' ],
  },
});
```

`resolve.extensions` 只用来处理 import specifier 不包含扩展名的情况，如果是具名引用，比如 `import './foo.json'`，那么 foo.json 仍然会被正确解析并引入，并且按照对应的模块类型 `JsonModule` 来处理。

### resolve.import: ImportOption[]

一些比较大的 UI 库、工具函数库并不推荐全量引用，但是为了使用便利，使用者通常还是会直接写。antd 提供的解决办法是配置 babel-plugin-import 来做代码转换，还兼容 lodash 等工具库的处理。

Porter 中也实现了这一逻辑，通过 `resolve.import` 配置即可：

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

是否提供源码访问，本地开发时需要开启，从而让浏览器可以将打包后的代码正确对应到源码，例如：

```javascript
new Porter({
  source: {
    serve: process.env.NODE_ENV === 'development',
  },
});
```

### source.root: string

Source Map 中的 sourceRoot 配置，默认为 `'/'`，生产模式编译时可以改成：

```javascript
new Porter({
  source: {
    root: 'https://some.where/that/holds/the/source',
  },
});
```
可以在源码服务加上 ACL 网管来控制源码可见性。

## postcssPlugins: PostcssPlugin[]

Porter 使用 PostCSS 处理 CSS，默认只是用来处理 `@import './foo'` ，应用可以按需配置 PostCSS 插件来完成 CSS 编译，打包的部分仍然交给 Porter，例如：

```javascript
new Porter({
  postcssPlugins: [
    autoprefixer(),
    cssnano(),
  ],
});
```

## uglifyOptions: {}

Porter 使用 UglifyJS 3 压缩 JS，个别情况可能需要调整压缩设置，比如 TypeScript 的装饰器可能依赖 `this.constructor.name` 读取类名，如果压缩后的代码中有多个类名重复，可能导致读取不到正确的 Reflect metadata，此时需要开启对应代码的 `keep_fnames` 设置。
