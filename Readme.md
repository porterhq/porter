# Oceanify

Oceanify is yet another solution for frontend modularization. It features
module transformation on the fly and a swift setup.

## tl;dr

With Oceanify setup, you can write your webpages like this:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Oceanify Rocks!</title>
  <link rel="stylesheet" type="text/css" href="/main.css">
</head>
<body>
  <h1>Oceanify Rocks!</h1>
  <script src="/main.js"></script>
</body>
</html>
```

And witin `main.js`, you can `require` any dependencies you want:

```js
var $ = require('jquery')
var cropper = require('cropper')

var nav = require('./nav')

// setup page with those required components and modules
```

You can do the same in `main.css`:

```css
@import '/cropper/dist/cropper.css';

@import './nav.css';
```

And when you want your web pages and application be production ready, simply
run:

```js
var co = require('co')
var oceanify = require('oceanify')

co([
  oceanify.compileAll(),          // js components and modules
  oceanify.compileStyleSheets()   // css files
])
  .then(function() {
    console.log('assets compiled.')
  })
  .catch(function(err) {
    console.error(err.stack)
  })
```


## Goal

Oceanify enables you to share and utilize frontend modules to and from NPM.
It provides a way that is somehow different than browserify and webpack for
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

Anyway, to use Oceanify in your Koa instance, just `app.use` it.

```js
var koa = require('koa')
var oceanify = require('oceanify')

var app = koa()

// that's it
app.use(oceanify())
```

If you'd prefer your frontend modules in some other names rather than the
default `components`, you can tell Oceanify that with the base option.

```js
app.use(oceanify({ base: 'browser_modules' }))
```

If Express is the framework you're using, you need to tell Oceanify about it:

```js
var express = require('express')
var oceanify = require('oceanify')

var app = express()

// that's it
app.use(oceanify({ express: true }))
```


## Deployment

Oceanfiy provides two static methods for assets precompilation. It's called
`oceanify.compileAll()` and `oceanify.compileStyleSheets()`.


### `.compileAll*([options])`

`.compileAll([options])` is a generator function. You need to wrap the returned
generator object to make it function properly.

```js
var co = require('co')
var oceanify = require('oceanify')

// Specify the entry modules
co(oceanify.compileAll({ base: './components', dest: './public' }))
  .then(function() {
    console.log('done')
  })
  .catch(function(err) {
    console.error(err.stack)
  })

// You can omit the options since they're the defaults.
co(oceanify.compileAll())
```

Oceanify will compile all the modules within `components` directory, find their
dependencies in `node_modules` directory and compile them too.

You can try the one in [Oceanify Example][oceanify-example]. Just execute
`npm run precompile`.


### `.compileStyleSheets*([options])`

`.compileStyleSheets([options])` is a generator function. You need to wrap the
returned generator object to make it function properly.

```js
var co = require('co')
var oceanify = require('oceanify')

co(oceanify.compileStyleSheets({ base: './components', dest: './public' }))
  .then(function() {
    console.log('done')
  })
  .catch(function() {
    console.error(err.stack)
  })
```

Currenty `.compileStyleSheets` just process the source code with autoprefixer
and postcss-import. You gonna need some minification tools like
[cssnano][cssnano].


# Oceanify 前端模块化

我们希望借助 Oceanify，让前端代码能够模块化开发，并且直接使用 NPM 分享。同时，我们希望
Oceanify 可以帮助压缩、发布前端代码。


## tl;dr - 一言以蔽之

借助 Oceanify，我们可以这样做前端开发：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Oceanify Rocks!</title>
  <link rel="stylesheet" type="text/css" href="/main.css">
</head>
<body>
  <h1>Oceanify Rocks!</h1>
  <script src="/main.js"></script>
</body>
</html>
```

在 `main.js` 里，你可以任意 `require` 依赖：

```js
var $ = require('jquery')
var cropper = require('cropper')

var nav = require('./nav')

// 页面逻辑代码
```

在 `main.css` 也可以放肆 `@import`：

```css
@import '/cropper/dist/cropper.css';

@import './nav.css';
```

到上线的时候，可以使用如下代码压缩静态资源，Oceanify 将会压缩、合并相关文件，所以不必担心
`@import` 会拖慢页面展现，也不必担心优化工具说你的页面请求数过多啦：

```js
var co = require('co')
var oceanify = require('oceanify')

co([
  oceanify.compileAll(),          // js components and modules
  oceanify.compileStyleSheets()   // css files
])
  .then(function() {
    console.log('assets compiled.')
  })
  .catch(function(err) {
    console.error(err.stack)
  })
```


## Usage - 用法

如果你的网站采用 Express 或者 Koa 开发，那么用 Oceanify 开发前端代码再合适不过。以
Koa 为例，只需在 `app.js` 中添加如下代码即可：

```js
var oceanify = require('oceanify')

// 使用默认设置
app.use(oceanify())

// 指定前端代码所在目录，默认为 components，根路径为 process.cwd()，即应用根目录
app.use(oceanify({ base: 'components' }))
```

如果你用的开发框架是 Express，则需要修改初始化代码为：

```js
app.use(oceanify({ express: true }))
```


不管是 Express 还是 Koa，比较推荐 Web 应用的目录结构如下：

```bash
.
├── app.js              # 应用入口
├── components          # 应用自己的前端模块
│   ├── arale
│   │   └── upload.js
│   └── main.js
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
// components/main.js
var $ = require('yen')
var Upload = require('arale/upload')

// code
```

在浏览器请求 `/main.js` 时，oceanify 将返回：

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
var co = require('co')
var oceanify = require('oceanify')

// 指定前端代码所在目录，以及编译文件存放目录
co(oceanify.compileAll({ base: './components', dest: './public' }))
  .then(function() {
    console.log('done')
  })
  .catch(function(err) {
    console.log(err.stack)
  })

// 上面的 base 和 dest 为默认设置，因此也可以省略
co(oceanify.compileAll())
  .then(function() {
    console.log('done')
  })
  .catch(function(err) {
    console.log(err.stack)
  })
```

Oceanify 将会编译所有 `components` 目录中的模块，并找出这些模块依赖的外部（那些通过
NPM 安装，放在 `node_modules` 目录下的）模块，然后一并编译掉。

可以在 [Oceanify Example][oceanify-example] 里尝试编译，执行 `npm run precompile`
即可。


## Facilities - 配套设施

### Oceanifier - 命令行工具

为了让不方便使用 Oceanify 的前端工程师也能享受 Oceanify 带来的便利，我们还提供了
[Oceanifier][oceanifier] 命令行工具。使用 Oceanifier，我们不搭建 Express 或者 Koa
服务，也可以使用 CommonJS 的模块写法。

在我们提供的 [Oceanify Example][oceanify-example] 里，运行 Oceanifier 提供的命令
`ocean serve`，同样也能打开我们的效果演示。

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
[oceanify-example]: https://github.com/erzu/oceanify/test/example
[oceanifier]: https://github.com/erzu/oceanifier
[cmd-util]: https://www.npmjs.com/package/cmd-util
[cssnano]: https://github.com/ben-eb/cssnano
