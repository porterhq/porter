---
layout: zh
title: 模块加载器
---

Porter 的模块加载器主要包含如下配置项：

| 属性 | 描述 |
|-----|------|
| alias | 解析依赖时的别名，例如配置项目根路径别名 `import('@/foo')` 到 `import('../../foo')` |
| baseUrl | 构建产物的根路径 |
| map | 模块 URL 的映射，例如映射 http://${baseUrl}/foo.js 到 http://${baseUrl}/bar.js |
| preload | 可以预加载的公共依赖，类似 webpack 的 common |
| timeout | 入口模块初始化的超时时间 |

上述配置项均可在初始化 Porter 时传入：

```js
const porter = new Porter({
  alias: {
    '@': '',
    '@cara': 'cara',
  },
  baseUrl: '/public/',  // 默认为 '/'
  map: {
    '/foo/': '/bar/',
    '/foo.js': '/bar.js',
  },
  preload: 'common',
  timeout: 5e3,
});
```
