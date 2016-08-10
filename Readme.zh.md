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

配置完毕之后，就可以开始在视图中引入前端模块了。假设有 `views/index.html` 文件，添加首页 JS
和 CSS 模块方式如下：

```html
<!-- views/index.jade -->
<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="/index.css">
  </head>
  <body>
    <script src="/index.js?main"></script>
  </body>
</html>
```

`/index.js` 路径对应 `components/index.js` 文件，`?main` 参数则用来告诉 Oceanify，
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

`/index.css` 路径对应 `components/index.css` 文件。因为 CSS 模块加载全部在后端处理，
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

通过 `?main` 指定入口模块之后，Oceanify 会返回模块加载器及其配置，因此默认情况下模块加载器的
配置入口是隐藏的，在入口模块的响应内容中就指定了：

```js
// http://example.com/index.js?main
(function(global) {
  // loader code
  global.oceanify = { ... }
})(this)

oceanify.config({
  base: '',
  map: '',
  modules: {},
  dependencies: {}
})
```

其中 modules 和 dependencies 是 Oceanify 在初始化的时候通过分析 components 和
node_modules 目录结构生成的；base 和 map，则开发用户配置。

可以使用 opts.loaderConfig 来配置这两个配置项：

```js
loaderConfig: {
  base: 'http://cdn.example.com',
  map: { ... }
}
```

详细 opts.loaderConfig 配置解析见下文。


#### opts.loaderConfig.base

可以使用 opts.loaderConfig.base 配置模块记载器的根路径，例如：

```js
app.use(oceanify({
  loaderConfig: {
    base: 'http://cdn.example.com'
  }
}))
```

在默认情况下，Oceanify 的模块加载器将以 location.origin 为 base，对应关系如下：

| module id | module.uri { base: '' }     | module.uri { base: 'http://cdn.example.com' } |
|-----------|-----------------------------|-----------------------------------------------|
| index.js  | http://example.com/index.js | http://cdn.example.com/index.js               |


#### opts.loaderConfig.map

可以使用 opts.loaderConfig.map 配置模块映射，从而修改某些模块的下载地址（module.uri）：

```js
app.use(oceanify({
  loaderConfig: {
    map: {
      jquery: 'https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js'
    }
  }
}))
```

也可以写正则：

```js
app.use(oceanify({
  loaderConfig: {
    base: 'http://cdn.example.com',
    map: {
      '(templates|creatives)/(\\d+)': '/$1/$2.js'
    }
  }
}))
```

上述例子将所有 templates/${id} 和 creations/${id} 的模块地址映射到本地，而不是 base
里配置的 <http://cdn.example.com>。因此 Oceanify 会去 <http://${loaction.origin}/templates/${id}.js>
下载模块代码，而非 <http://cdn.example.com/templates/${id}.js>。

当然，因为 map 中的 pattern 默认从 module id 行首开始匹配，上述例子不写正则也可以实现：

```js
app.use(oceanify({
  loaderConfig: {
    base: 'http://cdn.example.com',
    map: {
      creatives: '/creatives',
      templates: '/templates'
    }
  }
}))
```


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

不建议线上环境开启这项功能，会造成源码泄漏。我们将在 oceanify.compileAll 章节深入讨论
Source Map 以及 Oceanify 的支持方式。

默认值：`false`。


## 部署

TODO


## 模块加载器

TODO


[oceanifier]: https://github.com/erzu/oceanifier
