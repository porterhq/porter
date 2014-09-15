# Golem - 前端模块化

我们希望借助 Golem，让前端代码能够模块化开发，并且直接使用 NPM 分享。同时，我们希望 Golem 可以帮助压缩、发布前端代码。

## Evolving Component - 前端组件演化

### CommonJS - 一致的模块写法

在前些年，模块加载器如雨后春笋一般冒出来，我们看到形形色色的写法，比如：

- RequireJS
- SeaJS
- KISSY
- KSLITE
- ……等等

详细的语法差别，我在这篇 [知乎回答][loaders] 里有所描述。

此外，前三者还考虑到了前后端代码的问题，比如你可以直接在 Node 中：

```js
var seajs = require('seajs')

seajs.use('some/module', function() {
  // code
})
```

但不管怎么说，这种代码共享方式都只是一种曲线救国。因为理论上说，能够在 Node 中运行的前端代码，去掉了那层模块声明语法，比如把 SeaJS 的：

```js
define(function(require, exports, module) {
  // factory code
})
```

变成：

```js
// factory code
```

也就是用 CommonJS 的模块写法，本来就可以直接在 Node 中 `require` 了。这是我们做 Golem 的初衷之一。我们也非常高兴地看到，无论是 Arale（及其背后的 SPM）、还是 KISSY，都已经开始去掉这一层实可省略的匿名函数。

### Template - 模板

通过 Golem，还可以直接 `require` HTML 文件，读入后是解析成 DOM，还是作为模板字符串处理，就悉听尊便了，比如：

```js
// 将会读入当前目录中的 template.html 文件
var template = require('./template')

require('mustache').render(template, { ... })
```

## Usage

如果你的网站采用 Express 或者 Koa 开发，那么用 Golem 开发前端代码再合适不过。以 Express 为例，只需在 `app.js` 中添加如下代码即可：

```js
var golem = require('@ali/golem')

// 使用默认设置
app.use(golem())

// 指定前端代码所在目录，默认为 ./components，基准路径为 process.cwd()，即 Express 应用的根目录
app.use(golem({ base: './components' }))
```

如果你用的开发框架是 Koa，改为 `require('@ali/golem/g')` 即可，这个函数将返回可供 Koa 使用的 generator function。

不管是 Express 还是 Koa，比较推荐 Web 应用的目录结构如下：

```bash
.
├── app.js              # 应用入口
├── components          # 应用自己的前端模块
│   ├── arale
│   │   └── upload.js
│   └── papercut
│       └── index.js
└── node_modules        # 来自 NPM 的外部依赖
    └── @ali
        └── yen
            ├── easing.js
            ├── events.js
            ├── index.js
            └── support.js
```

不管是 components 还是 node_modules 中的模块，golem 都能够将它们封装为前端模块加载器所能接收的写法。所以在上述文件结构中，我们可以在 components 的模块中使用 [yen][yen] 模块，也可以 `require` components 中的兄弟模块：

```js
// components/papercut/index.js
var $ = require('@ali/yen')
var Upload = require('arale/upload')

// code
```

在浏览器请求 `/papercut/index.js` 时，golem 将返回：

```js
define('papercut/index', ['@ali/yen', 'arale/upload'], function() {
  var $ = require('@ali/yen')
  var Upload = require('arale/upload')

  // code
})
```

还可以参考使用 connect 与 golem 搭建的 [Golem Example][golem-example]。

## Deployment - 部署时

### Compilation - 编译

利用 `golem.compile()` 与 `golem.compileAll()` 方法，可以很方便地在部署时压缩代码。

```js
var golem = require('@ali/golem')

// 指定前端代码所在目录，以及编译文件存放目录
golem.compileAll({ base: './components', dest: './public' })

// 上面的 base 和 dest 为默认设置，因此也可以省略
golem.compileAll()
```

## Facilities - 配套设施

### Golem Kit - 命令行工具

Golem 本身不提供发布到 CDN 的功能，不过为了方便模块复用，也方便不使用 Golem 的前端工程师也能使用基于 Golem 开发的前端模块，模块开发者可以使用 [Golem Kit][golem-kit] 命令行工具发布模块代码到 CDN：

```js
➜  belt git:(master) golem deploy
```

将会压缩模块代码，合并 index.js 的依赖，并推送到 CDN。

此外，Golem Kit 还集成了许多对单个模块开发非常有帮助的功能，快 [去看看][golem-kit] 吧。

## Golem Daemon - 文档网站

// TODO

## Golem Example - Golem 使用示例

为了方便理解 Golem 的好处，我们专门开发了一个与业务无关的 [Golem 示例][golem-example]，在其中演示了如何在一个 Node Web 应用中使用 NPM 安装外部前端模块，以及如何在应用中开发自有模块。


[loaders]: http://www.zhihu.com/question/22739468/answer/29949594
[central]: http://gitlab.alibaba-inc.com/groups/central
[yen]: http://gitlab.alibaba-inc.com/central/yen
[golem-example]: http://gitlab.alibaba-inc.com/central/golem-example
[golem-kit]: http://gitlab.alibaba-inc.com/central/golem-kit
