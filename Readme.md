# Oceanify - 前端模块化

我们希望借助 Oceanify，让前端代码能够模块化开发，并且直接使用 NPM 分享。同时，我们希望 Oceanify 可以帮助压缩、发布前端代码。


## Usage

如果你的网站采用 Express 或者 Koa 开发，那么用 Oceanify 开发前端代码再合适不过。以 Express 为例，只需在 `app.js` 中添加如下代码即可：

```js
var oceanify = require('oceanify')

// 使用默认设置
app.use(oceanify())

// 指定前端代码所在目录，默认为 ./components，基准路径为 process.cwd()，即 Express 应用的根目录
app.use(oceanify({ base: './components' }))
```

如果你用的开发框架是 Koa，改为 `require('oceanify/g')` 即可，这个函数将返回可供 Koa 使用的 generator function。

不管是 Express 还是 Koa，比较推荐 Web 应用的目录结构如下：

```bash
.
├── app.js              # 应用入口
├── components          # 应用自己的前端模块
│   ├── arale
│   │   └── upload.js
│   └── papercut
│       └── index.js
└── node_modules        # 来自 NPM 的外部依赖
    └── yen
        ├── easing.js
        ├── events.js
        ├── index.js
        └── support.js
```

不管是 components 还是 node_modules 中的模块，oceanify 都能够将它们封装为前端模块加载器所能接收的写法。所以在上述文件结构中，我们可以在 components 的模块中使用 [yen][yen] 模块，也可以 `require` components 中的兄弟模块：

```js
// components/papercut/index.js
var $ = require('yen')
var Upload = require('arale/upload')

// code
```

在浏览器请求 `/papercut/index.js` 时，oceanify 将返回：

```js
define('papercut/index', ['yen', 'arale/upload'], function() {
  var $ = require('yen')
  var Upload = require('arale/upload')

  // code
})
```

还可以参考使用 connect 与 oceanify 搭建的 [Oceanify Example][oceanify-example]。


## Deployment - 部署时

### Compilation - 编译

利用 `oceanify.compile()` 与 `oceanify.compileAll()` 方法，可以很方便地在部署时压缩代码。

```js
var oceanify = require('oceanify')

// 指定前端代码所在目录，以及编译文件存放目录
oceanify.compileAll({ base: './components', dest: './public' })

// 上面的 base 和 dest 为默认设置，因此也可以省略
oceanify.compileAll()
```


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

但不管怎么说，这种代码共享方式都只是一种曲线救国。因为理论上说，能够在 Node 中运行的前端代码，去掉那层模块声明语法，本来就可以在 Node 中直接 `require`。比如把 SeaJS 的：

```js
define(function(require, exports, module) {
  // factory code
})
```

变成：

```js
// factory code
```

也就是用 CommonJS 的模块写法。这是我们做 Oceanify 的初衷之一。我们也非常高兴地看到，无论是 Arale（及其背后的 SPM）、还是 KISSY，都已经开始去掉这一层实可省略的匿名函数。


### Template - 模板（未实现）

通过 Oceanify，还可以直接 `require` HTML 文件，读入后是解析成 DOM，还是作为模板字符串处理，就悉听尊便了，比如：

```js
// 将会读入当前目录中的 template.html 文件
var template = require('./template')

require('mustache').render(template, { ... })
```

**2014-09-25 注**：这项特性是想抄袭 component.io，尚未实现，以后是否实现待定。


## Tribute

### cmd-util

`lib/cmd-util` 来自 [cmd-util][cmd-util] 模块，源自 @[lepture][1] 的杰出工作。

放入 oceanify 是为了方便集成 deheredoc 功能，以及确保 oceanify 和 cmd-util 中使用的
UglifyJS 是同一份（不然假如我传入 oceanify 中解析好的 UglifyJS AST，在 cmd-util 里
用 `instanceof` 判断语法节点类型就会出问题）。


## Facilities - 配套设施

### Oceanifier - 命令行工具

Oceanify 本身不提供发布到 CDN 的功能，不过为了方便模块复用，也方便不使用 Oceanify 的前端工程师也能使用基于 Oceanify 开发的前端模块，模块开发者可以使用 [Oceanifier][oceanifier] 命令行工具发布模块代码到 CDN：

```js
➜  belt git:(master) oceanify deploy
```

将会压缩模块代码，合并 index.js 的依赖，并推送到 CDN。

此外，Oceanifier 还集成了许多对单个模块开发非常有帮助的功能，快 [去看看][oceanifier] 吧。


### Oceanify Example - Oceanify 使用示例

为了方便理解 Oceanify 的好处，我们专门开发了一个与业务无关的 [Oceanify 示例][oceanify-example]，在其中演示了如何在一个 Node Web 应用中使用 NPM 安装外部前端模块，以及如何在应用中开发自有模块。


[loaders]: http://www.zhihu.com/question/22739468/answer/29949594
[yen]: https://github.com/erzu/yen
[oceanify-example]: https://github.com/erzu/oceanify-example
[oceanifier]: https://github.com/erzu/oceanifier
[cmd-util]: https://www.npmjs.com/package/cmd-util
[1]: https://github.com/lepture
