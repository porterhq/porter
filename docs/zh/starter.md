---
layout: zh
title: 快速上手
---

## 目录
{:.no_toc}

1. 目录
{:toc}

## 开发环境

假设我们要开始编写一个前端项目，这个项目没有服务端逻辑，只需要完成前端 HTML/JavaScript/CSS 的编写，有前端依赖比如 React、PrismJS 等需要通过 npm 安装：

```bash
$ mkdir examples/cli
$ cd examples/cli
$ npm install react prismjs @cara/porter-cli --save-dev
$ touch index.html
```

### HTML

在 index.html 文件中分别添加 JavaScript 和 CSS 入口：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>A Porter Demo</title>
  <!-- CSS 入口 -->
  <link rel="stylesheet" type="text/css" href="/app.css">
</head>
<body>
  <h1>A Porter Demo</h1>
  <!-- JavaScript 入口 -->
  <script src="/app.js?main"></script>
</body>
</html>
```

### JS

在 JavaScript 入口文件 `app.js` 中可以 `import` 依赖：

```jsx
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import Prism from 'prismjs';

function App() {
  useEffect(function() {
    Prism.highlightAll()
  }, []);
  return <h1>It works!</h1>;
}

ReactDOM.render(<App />, document.querySelector('#ReactApp'));
```

### CSS

在 CSS 入口文件中 `app.css`，可以使用 `@import` 引入

```css
@import 'prismjs/themes/prism.css';   /* stylesheets in dependencies */
@import './base.css';                 /* stylesheets in package */
```

### 目录结构

到这个步骤，我们这个演示应用的目录结构大致如下：

```bash
➜  examples/cli git:(master) tree -L 2 -I node_modules
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

也可以克隆 [Porter 源码](https://github.com/porterhq/porter)，访问 examples/cli 目录了解这个演示应用。

### 启动

运行 `@cara/porter-cli` 提供的 porter 命令，启动开发环境：

```bash
➜  examples/cli git:(master) npx porter serve
Server started at 5000
```

访问 <http://localhost:5000> 即可。

## 打包构建

本地完成代码编写准备交付的时候，可以使用如下命令完成代码构建：

```bash
➜  examples/cli git:(master) npx porter build --entry app.js app.css
```

将根据 `--entry` 参数指定的入口模块查找相关依赖、编译代码、合并依赖、以及压缩构建产物，默认将构建结果输出到 dist 目录。

如果不指定 `--entry`，将使用当前目录的 package.json 配置的 module 或者 main 作为入口模块。

也可以使用这个命令构建 npm 包，以 examples/component 为例，开启 `--package` 参数即可：

```bash
➜  examples/component git:(master) npx porter build --package
```
