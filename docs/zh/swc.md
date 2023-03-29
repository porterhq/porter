---
layout: zh
title: 迁移到 SWC
---

## 目录
{:.no_toc}

1. 目录
{:toc}

## 概要

Porter v4.6 支持切换到 [SWC](https://swc.rs) 编译，相比原先的 Babel + UglifyJS，两套方案的性能差异大致如下：

|  | porter v3.x | porter v4.0.x | porter v.4.6.x | porter v4.6.x (m1) |
| --- | --- | --- | --- | --- |
| w/ cache | 00:05:00.145 | 00:03:55.166 | 00:02:50.812 | 00:02:13.685 |
| w/o cache | 00:09:09.613 | 00:09:07.572 | 00:04:31.296 | 00:02:34.915 |

> 1. 表格中记录的时间为完成一个 10w+ 行（不包括组件库、React 等外部依赖）前端代码量的工程构建耗时；
> 2. 表格中 v3.x 的构建时间记录比较早，当时工程代码量没有现在大，如果现在使用 v3.x 版本构建，时间会更久

v4.6 仍有如下优化项目在进行中：

- [x] 由于 js 模块编译后可能引入新的依赖（@babel/runtime、@swc/helpers 等等），当前的编译过程会有第二次解析，目的是更新依赖树；通过增加专门 SWC 构建产物模块类型，可以合并这一过程；
- [ ] 单次构建会出现 Bundle 重复打包的情况（有 bundle.exists() 方法来避免重复生成，但仍然影响性能）；
- [ ] 编译环节是否有步骤可以并发（目前生成 bundle 的过程是顺序进行的）；

目前需要通过环境变量 SWC 来开启：

```bash
$ SWC=true npx porter serve .
```

或者使用 swc 配置项：

```js
const porter = new Proter({ swc: true });
```

## 为什么增加模块类型

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

- ES Module 格式需要比较新的浏览器，长远来看未来可能用 rollup + importMap 就能搞定，浏览器走原生的 ES Module，但按照 Porter 目前需要支持的浏览器范围，还不太行；
- CommonJS 需要全局的 require、exports、以及 module 注入，并且有相关的依赖 resolve 逻辑，这个其实最接近 Porter 的使用方式，之前使用 Babel 编译的模块类型也是这个，但需要在打包阶段做一层包装；
- AMD 是比较适合浏览器的格式，但是所提供的 require 行为逻辑与 CommonJS 差异较大，并且似乎不支持从 CommonJS 编译到 AMD；
- UMD 是 CommonJS 和 AMD 的胶水格式，基于前面的讨论，同样不太合适；
- SystemJS 是专有格式，更加不适合依赖了；

在切换到 SWC 之前，Porter 的做法大致如下：

```js
// 源文件
import Foo from './foo';
export function createFoo() {
  return new Foo();
}
```

转换为：

```js
const Foo = require('./foo');
exports.createFoo = function() {
  return new Foo();
}
```

然后在打包的时候处理成：

```js
porter.define(`{moduleId}`, ["./foo"], function(require, exports) {
  const Foo = require('./foo');
  exports.createFoo = function() {
    return new Foo();
  }
});
```

这个格式和 AMD 非常像，主要的差异是这里的 require 行为和 CommonJS 一致，是同步调用，而 AMD 里的需要传入回调函数（如果不传则返回 Promise）：

```js
require('./foo', (foo) => { ... });
```

按照之前的实现，上面这层包装会在交给 UglifyJS 压缩代码之前完成，所以函数中的 require、exports、以及 module 会被正确压缩掉，但切换到 SWC 之后，其实可以合并成一个环节，从而一次性搞定（解析代码 -> 转换 AST -> 生成代码）这三个步骤。

## 一些扩展处理

除了做必要的模块代码包装，PorterJS 模块类型还会有如下特殊处理：

- 不管代码格式是 module 还是 script，require 调用也会被解析，引入的依赖会被合并到最终生成的依赖列表中；
- 依赖 loose-envify 或者类似工具实现条件依赖的代码会被提前处理，即便没有开启代码压缩也会被删减，从而省略运行时不必要的依赖；

前者可以看下面这个例子：

```js
import Foo from './foo';
require('./bar')(Foo);
```

上述代码会被转换为：

```js
porter.define(`{moduleId}`, ["./foo", "./bar"], function(require) {
  const Foo = require('./foo');
  require('./bar')(Foo);
});
```

后者可以参考 react 的入口模块代码：

```js
'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/react.production.min.js');
} else {
  module.exports = require('./cjs/react.development.js');
}
```

上述代码会被转换为：

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

> 这里仍然保留 if else 结构是因为 SWC 变换 AST 时需要保持节点类型不变，同时出于性能考虑，没有提供向上回溯父节点的 API
