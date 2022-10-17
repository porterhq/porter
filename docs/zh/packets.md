---
layout: zh
title: 包
---

## 目录
{:.no_toc}

1. 目录
{:toc}

## 使用说明

Porter 中的“包”（Packet）是个内部概念，定义和作用与 NPM 包基本对应，有如下作用：

- 处理 NPM 包中的配置，主要是 package.json 中的字段，比如读取缺省入口模块（module、browser 字符串、或者 main 字段）；
- 处理 browser 字段扩展，主要是 browserify 所扩展的对象字面量（browser 字段的值是个 object，可以用来配置别名）；
- 按 NPM 包配置是否开启代码转换，是否拆分包；

可以通过 transpile.include 或者 bundle.exclude 等配置项来影响对应包的处理方式，例如：

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

上述配置将会开启 antd 的代码转换，并且在打包构建阶段将 antd 拆分为单独的 JavaScript 构建产物，生成类似 antd/${version}/lib/index.${contenthash}.js 格式的文件。
