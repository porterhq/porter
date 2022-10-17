---
layout: zh
title: 命令行工具
---

## 目录
{:.no_toc}

1. 目录
{:toc}

## 使用方式

Porter 的命令行工具是个单独的包，主包是 @cara/porter，命令行工具包是 @cara/porter-cli，安装后者即安装命令行工具：

```bash
$ npm install @cara/porter-cli -g
```

安装好之后，会将 `porter` 命令添加到全局的 bin 目录（macOS 是 /usr/local/bin），然后就可以在具体的前端开发项目中运行了：

```bash
$ porter serve
Server started at http://localhost:3000
```

如果不喜欢安装到全局，也可以作为开发依赖安装到项目根目录：

```bash
$ npm install @cara/porter-cli --save-dev
$ npx porter serve
Server started at http://localhost:3000
```

### 开发 Web 应用

默认配置的前端源码目录为 ./components，也就是下面这种目录结构：

```bash
➜  demo-cli git:(master) tree -L 2
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

### 开发前端模块

可以直接将当前目录作为源码目录，例如：

```bash
➜  demo-component git:(master) tree . -I node_modules
.
├── index.js
├── package.json
└── test
    └── suite.js
```

对应的运行命令为：

```bash
$ porter serve --paths .
Server started at http://localhost:3000
```

详细使用方式可以参考 <https://github.com/porterhq/porter/tree/master/packages/demo-component>

### 打包构建

打包构建对应的子命令是 porter-build，除了与 porter-serve 一致的 Porter 基础配置之外，还支持传入入口模块名，从而按需构建：

```bash
$ porter build --paths web entry1.js entry2.js ...
```
