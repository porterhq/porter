[![NPM Downloads](https://img.shields.io/npm/dm/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![NPM Version](http://img.shields.io/npm/v/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![codecov](https://codecov.io/gh/porterhq/porter/branch/master/graph/badge.svg?token=9CNWJ1N4T9)](https://codecov.io/gh/porterhq/porter)

Porter 是一个 Web 打包构建工具，支持处理 ES Modules、CSS Modules，也支持开发者使用 TypeScript、Sass、或者 Less 等语言进行前端开发。

## 帮助文档

推荐阅读《[快速上手](https://porterhq.github.io/porter/zh/starter)》和《[帮助手册](https://porterhq.github.io/porter/zh/basics)》。

## NPM 包

Porter 维护两个 NPM 包，[@cara/porter](https://github.com/porterhq/porter/tree/master/packages/porter) 中间件和 [@cara/porter-cli](https://github.com/porterhq/porter/tree/master/packages/porter-cli) 命令行工具，其余 packages 目录下的包都是测试包，用来验证 Porter 功能。

可以参考下面几个包来进一步了解命令行工具的使用方式：

- packages/demo-component 演示如何使用 @cara/porter-cli 开发前端组件；
- packages/demo-cli 演示如何使用 @cara/porter-cli 开发 Web 应用；

其他包可能同时包含两种使用方式，目录中可能包含使用 @cara/porter 中间件的 app.js，也可能在 package.json 使用 @cara/porter-cli 来配置 `npm run dev` 命令。

## 如何参与

无论是提问题还是需求，是参与开发还是编写文档，Porter 都非常需要大家的参与，欢迎阅读《[如何参与](https://porterhq.github.io/porter/zh/contributing/guides)》一文了解更多。
