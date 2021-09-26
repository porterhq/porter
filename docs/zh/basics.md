---
layout: zh
title: 基础功能
---

## 目录
{:.no_toc}

1. 目录
{:toc}

## 功能简介

Porter 主要由三部分构成：

- 增强浏览器模块加载能力的模块加载器（loader）
- 分析查找依赖关系、编译代码、以及在必要的时候合并模块文件的 Node.js 中间件（middleware）
- 编译代码、根据依赖关系图合并文件、以及压缩构建产物的构建工具（builder）

其中 Node.js 中间件的逻辑最为核心也最为复杂，包含依赖分析、代码编译、以及一些简单的代码合并，在下文中被分解为几个基础概念来说明，分别是模块、包、以及相关衍生功能。

### 模块加载器

模块加载器是 Porter 的基础，用户可以在浏览器控制台访问 `window.porter` 变量来访问当前应用的模块运行时，包含信息如下：

| 属性名    | 描述信息 |
|----------|--------|
| `baseUrl` | 根路径，例如 `https://foo.alicdn.com` |
| `lock`    | 依赖信息，`{ [name]: { [version]: { bundle, main, dependencies } } }` |
| `packet`  | 应用名、版本、以及主入口，`{ name, version, main }` |
| `preload` | 预加载模块列表 |
| `registry` | 模块注册表 |

可以在 `porter.registry` 看到当前页面应用全部模块列表，还可以调用 `porter.import(specifier)` 方法来动态加载模块，会根据 `porter.lock` 查找相应的依赖信息，从而确保加载到正确的版本。

在常规使用方式中，一般不需要直接访问 `window.porter`，使用前文推荐的 `<script src="entry.js?main"></script>` 即可。推荐阅读《[模块加载器]({{ '/zh/loader' | relative_url }})》一文了解更多有关信息。

### 模块

Porter 中大致包含如下几种模块：

| 类型 | 描述 |
|------|-----|
| CssModule | CSS 模块，支持 SCSS、Less 等扩展语言的编译 |
| FileModule | 普通文件，用于追踪文件引用，将替换引用方式为 `window.fetch`，默认不合并文件 |
| JsModule  | JS 模块，支持 JS、JSX、TS、TSX，目前使用 Babel/TypeScript 编译，计划切换到 swc |
| JsonModule | JSON 模块，用于直接 import JSON 文件的情况，支持 jsonp 动态加载 |
| WasmModule | WebAssembly 模块 |

Porter 对普通文件的处理方式比较简单，仅转换相关引用代码为对应的异步请求格式 `fetch(new URL(specifer, import.meta.url)`，静态引用和动态引用的处理方式稍有不同：

| 引用方式 | 实际请求方式 |
|---------|------------|
| `import file from specifier` | 追加 specifier 到依赖列表，相关请求完成后执行当前模块，file 为上述请求的返回结果 |
| `import(speficier)` | 等价于上述请求，返回结果为 `Promise` |

具体模块的使用方式、与其他包管理工具的些微差异，推荐阅读《[模块]({{ '/zh/modules' | relative_url }})》一文了解更多。

### 包

npm 包在 Porter 中同样以“包”的形式存在，为了和 js 保留字 `package` 作区分，在 Porter 中包的类名为 `Packet`，实际上和 node_modules 下的 npm 包一一对应。

使用 Porter 的应用本身也会被看作一个包，在浏览器中可以通过 `window.porter.packet` 访问。

Porter 通过 `Packet` 来处理外部依赖查找、依赖入口模块管理、以及比较的入口模块合并。例如，如果代码中存在同一个包的不同引用比如 `lodash/debounce`、`lodash/throttle`，在 Porter 里面会被自动合并成 `lodash/bundle`，其中包含相关入口模块以及对应依赖，从而恰到好处地生成应用实际使用的依赖包。

如果在引用依赖包的时候没有指定入口模块（通常都不会指定），比如 `import React from 'react'`，`Packet` 会根据 `node_modules/react/package.json` 自动查找，按如下优先级读取入口模块信息：

- `module`
- `browser: string`
- `main`

如果 package.json 中的 browser 字段是个对象字面量，会被当作当前 Packet 范围内别名配置；如果这三个配置信息都不存在，则默认使用 index.js 作为入口。

### WebAssembly

Porter 对 WebAssembly 的支持程度还比较有限，目前仅支持 wasm-pack 的构建产物，要求依赖包的默认输出格式为 `export default function init(): Promise<exports>`。

可以参考 packages/hello-wasm 和 packages/demo-wasm 了解 WebAssembly 包的生产与使用方式。

### 构建工具

构建工具是 Porter 三大组成部分的最后一个，在应用完成功能开发、进入打包构建阶段的时候，需要使用生成器来编译前端代码，从而让代码兼容更多浏览器，以及在浏览器中取得最佳性能状态。

使用 `@cara/porter-cli` 命令行工具的用户，可以通过 `porter build` 命令完成资源构建：

```bash
➜  demo-cli git:(master) npx porter build --entry app.js
```

相关构建产物默认生成到 `dist` 目录，也可以使用 `--dest` 参数配置：

```bash
➜  demo-cli git:(master) npx porter build --entry app.js --dest public
```

更多有关构建工具的使用说明，推荐阅读《[命令行工具]({{ '/zh/cli' | relative_url }})》一文。

## 在 Web 框架中使用

在 Web 框架中集成 porter 非常简单，只需要安装 @cara/porter 然后根据应用框架选型配置即可。

### Koa / Egg / Chair / Midway

在 Koa 相关框架中使用 Porter 方式如下：

```js
const Koa = require('koa');
const Porter = require('@cara/porter');

const app = new Koa();
const porter = new Porter();
app.use(porter.async());
```

### Express

在 Express 中的使用方式类似：

```js
const express = require('express');
const Porter = require('@cara/porter');

const app = new express();
const porter = new Porter();

// express
app.use(porter.func());
```
