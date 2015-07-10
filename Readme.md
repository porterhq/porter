# Oceanify

Oceanify is yet another solution for front end modularization. It features
module transformation on the fly and a swift setup.


## Goal

Oceanify enables you to share and utilize front end modules to and from NPM.
It provides a way that is somehow different from browserify and webpack for
browser module authoring in CommonJS module definition.

With Oceanify, you can organize your browser modules and their dependencies like
this:

```bash
.
├── components          # browser modules
│   ├── arale
│   │   └── upload.js
│   └── main.js
└── node_modules        # dependencies
    └── yen
        ├── events.js
        ├── index.js
        └── support.js
```

Here's `main.js` would look like:

```js
var $ = require('yen')              // require a module from node_modules
var Upload = require('arale/upload')  // require other modules in components


var upload = new Upload('#btn-upload', { ... })

$('form').on('submit', function() {
  // ...
})
```


## Usage

To use Oceanify one must be aware that there are two versions of it. The one
you're reading about is a middleware for Express and Koa. The other is a command
line tool built upon Oceanify, called Oceanifier, which is a little bit mouthful
to pronounce.

Anyway, to use Oceanify in your Express instance, just `app.use` it.

```js
var express = require('express')
var oceanify = require('oceanify')

var app = express()

// that's it
app.use(oceanify())
```

If you'd prefer your frontend modules in some other names rather than the
default `components`, you can tell Oceanify that with the base option.

```js
app.use(oceanify({ base: 'browser_modules' }))
```

If Koa is the framework you're using, `require('oceanify/g')` instead.

```js
var koa = require('koa')
var oceanify = require('oceanify')

var app = koa()

// that's it
app.use(oceanify())
```


## Deployment

Oceanfiy provides a static method for assets precompilation. It's called
`oceanify.compileAll()`.

```js
var oceanify = require('oceanify')

// Specify the entry modules
oceanify.compileAll({ base: './components', dest: './public' })

// You can omit the options since they're the defaults.
oceanify.compileAll()
```

Oceanify will compile all the modules within `components` directory, find their
dependencies in `node_modules` directory and compile them too.

You can try the one in [Oceanify Example][oceanify-example]. Just execute
`npm run precompile`.


# Oceanify 前端模块化

我们希望借助 Oceanify，让前端代码能够模块化开发，并且直接使用 NPM 分享。同时，我们希望
Oceanify 可以帮助压缩、发布前端代码。


## Usage - 用法

如果你的网站采用 Express 或者 Koa 开发，那么用 Oceanify 开发前端代码再合适不过。以
Express 为例，只需在 `app.js` 中添加如下代码即可：

```js
var oceanify = require('oceanify')

// 使用默认设置
app.use(oceanify())

// 指定前端代码所在目录，默认为 ./components，基准路径为 process.cwd()，
// 即 Express 应用的根目录
app.use(oceanify({ base: './components' }))
```

如果你用的开发框架是 Koa，改为 `require('oceanify/g')` 即可，这个函数将返回可供 Koa
使用的 generator function。

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

不管是 components 还是 node_modules 中的模块，oceanify 都能够将它们封装为前端模块加载器
所能接收的写法。所以在上述文件结构中，我们可以在 components 的模块中使用 [yen][yen] 模块，
也可以 `require` components 中的其他模块：

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

还可以参考使用 koa 与 oceanify 搭建的 [Oceanify Example][oceanify-example]。


## Deployment - 部署时

### Compilation - 编译

可以用 `oceanify.compileAll()` 方法帮你压缩代码。

```js
var oceanify = require('oceanify')

// 指定前端代码所在目录，以及编译文件存放目录
oceanify.compileAll({ base: './components', dest: './public' })

// 上面的 base 和 dest 为默认设置，因此也可以省略
oceanify.compileAll()
```

Oceanify 将会编译所有 `components` 目录中的模块，并找出这些模块依赖的外部（那些通过
NPM 安装，放在 `node_modules` 目录下的）模块，然后一并编译掉。

可以在 [Oceanify Example][oceanify-example] 里尝试编译，执行 `npm run precompile`
即可。


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

但不管怎么说，这种代码共享方式都只是一种曲线救国。因为理论上说，能够在 Node 中运行的前端代码，
去掉那层模块声明语法，本来就可以在 Node 中直接 `require`。比如把 SeaJS 的：

```js
define(function(require, exports, module) {
  // factory code
})
```

变成：

```js
// factory code
```

也就是用 CommonJS 的模块写法。这是我们做 Oceanify 的初衷之一。我们也非常高兴地看到，无论是
Arale（及其背后的 SPM）、还是 KISSY，都已经开始去掉这一层实可省略的匿名函数。


### Template - 模板（未实现）

通过 Oceanify，还可以直接 `require` HTML 文件，读入后是解析成 DOM，还是作为模板字符串
处理，就悉听尊便了，比如：

```js
// 将会读入当前目录中的 template.html 文件
var template = require('./template')

require('mustache').render(template, { ... })
```

**2014-09-25 注**：这项特性是想抄袭 component.io，尚未实现，以后是否实现待定。


## Tribute

### cmd-util

`lib/cmd-util` 来自 [cmd-util][cmd-util] 模块，源自 [@lepture][1] 的杰出工作。

放入 oceanify 是为了方便集成 deheredoc 功能，以及确保 oceanify 和 cmd-util 中使用的
UglifyJS 是同一份（不然假如我传入 oceanify 中解析好的 UglifyJS AST，在 cmd-util 里
用 `instanceof` 判断语法节点类型就会出问题）。


## Facilities - 配套设施

### Oceanifier - 命令行工具

为了让不方便使用 Oceanify 的前端工程师也能享受 Oceanify 带来的便利，我们还提供了
[Oceanifier][oceanifier] 命令行工具。使用 Oceanifier，我们不搭建 Express 或者 Koa
服务，也可以使用 CommonJS 的模块写法。

在我们提供的 [Oceanify Example][oceanify-example] 里，运行 Oceanifier 提供的命令
`oceanify serve`，同样也能打开我们的效果演示。

因此，如果没条件自己搭服务，就试试 Oceanifier 跑静态环境吧。

此外，Oceanifier 还集成了许多对单个模块开发非常有帮助的功能，我们有许多模块（[yen][yen]、
[ez-editor][ez-editor] 等）都是使用 Oceanifier 管理的，快 [去看看][oceanifier]。


### Oceanify Example - Oceanify 使用示例

为了方便理解 Oceanify 的好处，我们专门开发了一个与业务无关的
[Oceanify 示例][oceanify-example]，在其中演示了如何在一个 Node Web 应用中使用 NPM
安装外部前端模块，以及如何在应用中开发自有模块。


[loaders]: http://www.zhihu.com/question/22739468/answer/29949594
[yen]: https://github.com/erzu/yen
[ez-editor]: https://github.com/erzu/ez-editor
[oceanify-example]: https://github.com/erzu/oceanify-example
[oceanifier]: https://github.com/erzu/oceanifier
[cmd-util]: https://www.npmjs.com/package/cmd-util
[1]: https://github.com/lepture
