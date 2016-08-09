# Oceanify

又一个前端模块化开发解决方案。Oceanify 是一个 Koa/Express 中间件，在 Web 应用中配置使用后，
前端工程师即可像开发 Node.js 应用一样，使用 CommonJS 编写前端模块，以及使用 NPM 管理前端
依赖。也可以使用基于 Oceanify 的 [Oceanifier][oceanifier] 等工具来支持纯前端项目开发。


## 使用方式

以 Koa 应用为例，在 app.js 中配置 Oceanify 如下：

```js
const koa = require('koa')
const oceanify = require('oceanify')

const app = koa()

app.use(oceanify())
```

配置完毕之后，就可以开始在视图中引入前端模块了。假设有 `views/index.jade` 文件，添加首页 JS
和 CSS 模块方式如下：

```jade
// views/index.jade
doctype html
html
  head
    link(rel='stylesheet', href='/index.css')
  body
    script(src='/index.js?main')
```

`/index.js` 路径将对应 `components/index.js` 文件，`?main` 参数则用来告诉 Oceanify，
这个模块是页面入口。Oceanify 在响应这个模块的时候，将会把模块加载器、依赖信息等一并返回。
在 `components/index.js` 中，可以使用相对路径或者绝对路径引用依赖，也可以引用
node_modules 目录下的模块：

```js
// components/index.js
'use strict'

// 外部依赖
// cropper => node_modules/cropper/dist/cropper.js
var Cropper = require('jquery')

// 绝对路径
// lib/aside => components/lib/aside.js
var aside = require('lib/aside')

// 相对路径
// path.resolve('index', './lib/search') => components/lib/search.js
var search = require('./lib/search')
```

`/index.css` 路径将对应 `components/index.css` 文件。因为 CSS 模块加载全部在后端处理，
不涉及前端模块加载器，因此入口模块不需要配置 `?main` 参数。在 `components/index.css` 中，
可以使用相对路径或者绝对路径引用依赖，也可以引用 node_modules 目录下的模块的 CSS：

```css
/* components/index.css */

/*
 * 外部依赖
 * cropper/dist/cropper.css => node_modules/cropper/dist/cropper.css
 */
@import "cropper/dist/cropper.css";

/*
 * 绝对路径
 * lib/aside => components/lib/aside.css
 */
@import "lib/aside.css";

/*
 * 相对路径
 * path.resolve('index.css', './lib/search.css') => components/lib/search.css
 */
@import "./lib/search.css";
```

上述示例应用的结构为：

```bash
.
├── components          # browser modules
│   ├── lib
│   │   ├── aside.css
│   │   ├── aside.js
│   │   ├── search.css
│   │   └── search.js
│   ├── index.js
│   └── index.css
└── node_modules        # dependencies
    └── cropper
        ├── package.json
        └── dist
            ├── cropper.css
            └── cropper.js
```


## 配置

在初始化 Oceanify 的时候，可以传入配置项：

```js
app.use(oceanify({ /* 配置项 */ }))
```


### opts.cacheExcept

在默认情况下，Oceanify 在响应请求的时候遇到 node_modules 中的模块，就会编译它，打包它的
相对依赖，将编译结果存放到 `public`，从而加速外部依赖的响应速度。需要调试某个外部依赖的时候，
使用 opts.cacheExcept 即可关闭特定依赖的缓存逻辑：

```js
// 不缓存 yen
app.use(oceanify({ cacheExcept: 'yen' }))

// 不缓存 yen 和 jquery
app.use(oceanify({ cacheExcept: ['yen', 'jquery'] }))

// 关闭所有缓存
app.use(oceanify({ cacheExcept: '*' }))
```

默认值：`[]`。


### opts.cachePersist

在默认情况下，Oceanify 会在每次初始化的时候清空缓存目录，可以通过 opts.cachePersist 配置项
来关闭它：

```js
app.use(oceanify({ cachePersist: true }))
```

默认值：`false`。


### opts.dependenciesMap

Oceanify 内部使用 dependenciesMap 来维护模块的依赖关系，在一些特殊情况下，我们需要传入其他
项目的 dependenciesMap：

```js
const dependenciessMap = yield fetch('http://example.com/dependenciesMap.json')
app.use(oceanify({ dependenciesMap }))
```

默认值：`null`。


### opts.dest

Oceanify 默认会将模块缓存到 public 目录，可以使用 opts.dest 配置它：

```js
app.use(oceanify({ dest: '.oceanify-cache' }))
```

默认值：`public`。


### opts.express

默认返回的中间件为 Koa 格式：

```js
function* (next) {}
```

可以使用 opts.express 要求 Oceanify 返回 Express 格式的中间件：

```js
app.use(oceanify({ express: true }))
```

默认值：`false`。


### opts.loaderConfig

可以使用 opts.loaderConfig 来配置 Oceanify 的模块加载器，例如：

```js
app.use(oceanify({
  loaderConfig: {
    base: 'http://cdn.example.com',
    map: { users: '/users' }
  }
}))
```

上述配置告诉模块加载器去 http://cdn.example.com 下载模块，users 模块仍然从 `/` 下载。

默认值：`{}`。


#### opts.loaderConfig.base

#### opts.loaderConfig.dependenciesMap

#### opts.loaderConfig.map


### opts.paths

Oceanify 默认从 components 目录查找组件源码，可以使用 opts.paths 配置这一目录：

```js
app.use(oceanify({ paths: 'browser_modules' }))
```

opts.paths 支持传入数组，从而告诉 Oceanify 尝试从多个组件目录查找组件。


### opts.root

Oceanify 默认以 `process.cwd()` 为根目录，通常与项目根目录一致。遇到不一致的情况，可以使用
opts.root 来配置根目录，从而确保 opts.paths 都能正确查找：

```js
app.use(oceanify({ root: __dirname }))
```

默认值：`process.cwd()`


### opts.serveSelf

使用 Oceanify 开发前端模块的时候，需要响应项目目录下的内容。以 yen 为例，在 yen 项目目录下
运行 Oceanify，开启 opts.serveSelf 之后就会对应 `/yen/1.4.0/index.js` 到
`./index.js`。

一般 Web 应用中不需要使用到这一功能，切勿开启。

默认值：`false`。


### opts.serveSource

可以通过 opts.serveSource 告诉 Oceanify 响应源码请求，从而让 devtools 正常展现
Source Map：

```js
app.use(oceanify.use({ serveSource: true }))
```

开启 opts.serveSource 之后，Oceanify 将会响应如下请求：

```
GET /components/index.js
GET /components/lib/aside.js
GET /node_modules/cropper/dist/cropper.js
```

不建议线上环境开启这项功能，会造成源码泄漏。有关 Source Map，在 oceanify.compileAll 章节
我们将深入讨论。

默认值：`false`。


## 部署

TODO


## 模块加载器

TODO


[oceanifier]: https://github.com/erzu/oceanifier
