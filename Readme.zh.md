# Oceanify

又一个**前端模块化开发解决方案**。和 SeaJS、RequireJS 等纯前端模块加载器不同，Oceanify
包含两个部分：中间件和模块加载器。Oceanify 的目标是提供一个整体的前端模块化开发解决方案，
在功能定位上与 Webpack 和 browserify 相仿，只是解决方式不同。

Oceanify 提供的**中间件**支持 Koa 和 Express，在应用中配置后即可使用。不方便使用 Oceanify
中间件的前端工程师也可以使用基于 Oceanify 的 [Oceanifier][oceanifier] 工具来支持纯前端
项目开发。

Oceanify 提供的**模块加载器**采用 CMD 格式包装模块：

```js
define(${id}, ${dependencies}, function(require, exports, module) {
  // module code
})
```

和 SeaJS 的最大区别是，Oceanify 帮你**自动处理 CMD 包装**，并支持引用 node_modules
中的依赖。也就是说，你可以**使用 CommonJS 编写前端代码，并且使用 NPM 管理**。


## 使用

以 Koa 应用为例，在 app.js 中配置 Oceanify 中间件如下：

```js
const koa = require('koa')
const oceanify = require('oceanify')

const app = koa()

app.use(oceanify())
```

配置完毕之后，就可以开始在页面中引入前端模块了。假设有 `public/index.html` 文件，添加首页
JS 和 CSS 模块如下：

```html
<!-- views/index.html -->
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

`/index.js` 路径对应 `components/index.js` 文件，`?main` 参数则用来告诉 Oceanify
中间件，这个模块是入口。中间件在响应这个模块的时候，将会把模块加载器及其配置一并返回。

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
├── node_modules        # dependencies
│   └── cropper
│       ├── package.json
│       └── dist
│           ├── cropper.css
│           └── cropper.js
├── public
│   └── index.html
└── app.js
```


### JS 入口模块

和 Webpack 和 browserify 类似，Oceanify 有 JS 入口模块的概念。在页面中引入 JS 模块的时候，
需要告诉中间件，现在引入的这个模块是入口模块，请同时返回模块加载器及其配置项。标记入口模块的方式
是在 JS 路径后面跟上 main 参数：

```html
<script src="/index.js?main"></script>
```

这样，Oceanify 中间件在响应这个模块的时候，就会返回如下内容：

```js
// GET /index.js?main
(function(global) {
  // loader code
  global.oceanify = { ... }
})(this)

oceanify.config({
  // loader config
})

// 为支持低版本 IE，这里使用 oceanify['import'] 而非 oceanify.import，后者会报语法错误
oceanify['import']('index')
```

当然，也可以选择不使用这种略显嬉皮的方式，而是像其他传统模块加载器那样自行引入模块加载器和配置，
继而引入入口模块：

```html
<script src="/loader.js"></script>
<script>
oceanify.config(${loaderConfig})
oceanify['import']('index')
</script>
```


### 缓存

和 Webpack 或者 browerify 将模块依赖打包成一个文件或者按尺寸分割成多个包不同，Oceanify
天生是按模块组织代码的。在默认情况下，外部依赖会被编译，按模块名打包，放到缓存目录，从而加速开发
时的体验。所以一般我们推荐 Oceanify 中间件和静态文件服务中间件，比如 koa-static，配合使用：

```js
const koa = require('koa')
const oceanify = require('oceanify')
const serve = require('koa-static')

const app = koa()

app.use(serve('public'))
app.use(oceanify())
```

静态文件服务中间件需要在 Oceanify 中间件之前，这样才能拦截到 Oceanify 中间件生成的外部依赖
缓存，以及 Source Map 等。默认情况下，Oceanify 中间件生成的缓存文件会在 public 目录下，
可以使用 opts.dest 配置，详见下文配置项说明。


## 配置

Oceanify 的中间件和模块加载器均提供丰富配置项以满足各种开发需要，尤以中间件配置项为多。


### 中间件配置

在初始化 Oceanify 中间件的时候，可以传入配置项：

```js
app.use(oceanify({ /* 配置项 */ }))
```


### opts.cacheExcept

在默认情况下，中间件在响应请求的时候遇到 node_modules 中的模块，就会编译它，打包同目录下的
相对依赖，将编译结果存放到 `public`，从而加速外部依赖的响应速度。例如 yen 模块的源码中包含
两个文件：

- yen/index.js
- yen/events.js

在前端 `require('yen')` 的时候，模块加载器根据配置，会映射路径到 yen/1.4.0/index.js。
中间件接到请求后，则会根据 dependenciesMap 中存储的路径信息，找到 yen/1.4.0/index.js
对应的路径为 node_modules/yen/index.js。在响应这个请求的同时，会开始编译 yen；并且由于
index.js 中 `require('./events')`，中间件在编译时就会把两个模块合到一起。这样下次请求
yen/1.4.0/index.js 的时候，浏览器发起一次请求就够了。

需要调试某个外部依赖时，预编译就显得画蛇添足，可以使用 opts.cacheExcept 告诉中间件，不要缓存
特定外部依赖：

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

在默认情况下，中间件在每次初始化的时候会清空缓存目录。可以通过 opts.cachePersist 配置项
来关闭它：

```js
app.use(oceanify({ cachePersist: true }))
```

默认值：`false`。


### opts.dest

中间件默认会将模块缓存到 public 目录，可以使用 opts.dest 配置它：

```js
app.use(oceanify({ dest: '.oceanify-cache' }))
```

默认值：`public`。


### opts.express

中间件初始化的时候默认返回的格式为 Koa 格式：

```js
function* (next) {}
```

可以使用 opts.express 配置返回格式为 Express 格式：

```js
app.use(oceanify({ express: true }))
```

默认值：`false`。


### opts.loaderConfig

在使用嬉皮方式引入 JS 入口模块的时候：

```html
<script src="/index.js?main"></script>
```

我们无法在前端页面配置模块加载器，这时候可以通过 opts.loaderConfig 传递配置项：

```js
app.use(oceanify({
  loaderConfig: {
    base: 'http://cdn.example.com'
  }
}))
```

详细的配置项文档见“模块加载器配置”章节。


### opts.paths

中间件默认从 components 目录查找组件源码，可以使用 opts.paths 配置这一目录：

```js
app.use(oceanify({ paths: 'browser_modules' }))
```

opts.paths 支持传入数组，从而告诉中间件尝试从多个组件目录查找组件。


### opts.root

中间件默认以 `process.cwd()` 为根目录，通常与项目根目录一致。遇到不一致的情况，可以使用
opts.root 来配置根目录，从而确保 opts.paths 都能正确查找：

```js
app.use(oceanify({ root: __dirname }))
```

默认值：`process.cwd()`


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

**不建议线上环境开启这项功能**，会造成源码泄漏。我们将在 oceanify.compileAll 章节深入讨论
Source Map 以及 Oceanify 的支持方式。

默认值：`false`。


### 模块加载器配置

模块加载器提供配置项如下：

```js
loaderConfig: {
  base: 'http://cdn.example.com',
  map: { ... }
}
```

使用嬉皮方式引入 JS 入口模块的时候，需要通过中间接配置项传递模块加载器的配置：

```js
app.use(oceanify({
  loaderConfig: { ... }
}))
```

使用传统方式，则在页面中调用 oceanify.config 即可：

```js
oceanify.config({ ... })
```

下文中示例一律采用如下格式：

```js
loaderConfig: { ... }
```


#### loaderConfig.base

模块加载器默认从 location.origin 下载模块，即传统模块加载器中的 base 概念。可以使用
opts.loaderConfig.base 配置这一路径，例如：

```js
loaderConfig: {
  base: 'http://cdn.example.com'
}
```

配置前后的效果对应关系如下：

| module id | module.uri { base: '' }     | module.uri { base: 'http://cdn.example.com' } |
|-----------|-----------------------------|-----------------------------------------------|
| index.js  | http://example.com/index.js | http://cdn.example.com/index.js               |


#### loaderConfig.map

可以使用 opts.loaderConfig.map 配置模块映射，从而修改某些模块的下载地址（module.uri）：

```js
loaderConfig: {
  map: {
    jquery: 'https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js'
  }
}
```

也可以写正则：

```js
loaderConfig: {
  base: 'http://cdn.example.com',
  map: {
    '(templates|creatives)/(\\d+)': '/$1/$2.js'
  }
}
```

上述例子将所有 templates/${id} 和 creations/${id} 的模块地址映射到本地，而不是 base
里配置的 <http://cdn.example.com>。因此 Oceanify 会去 <http://${loaction.origin}/templates/${id}.js>
下载模块代码，而非 <http://cdn.example.com/templates/${id}.js>。

当然，因为 map 中的 pattern 默认从 module id 行首开始匹配，上述例子不写正则也可以实现：

```js
loaderConfig: {
  base: 'http://cdn.example.com',
  map: {
    creatives: '/creatives',
    templates: '/templates'
  }
}
```


## 部署

TODO


## 模块加载器

TODO


[oceanifier]: https://github.com/erzu/oceanifier
