---
layout: zh
title: 模块
---

## 目录
{:.no_toc}

1. 目录
{:toc}

## JavaScript 模块

支持 ES Modules 和 CommonJS 两种写法，推荐使用前者，基于前者比较容易实现剪枝，而后者就需要一些代码约定（参考 require.resolve 配置项)：

```js
// 可以通过标记 lodash exports 来实现剪枝，移除没有被 import 过的 exports，剩下的交给代码压缩工具
import { throttle } from 'lodash';
// 需要配置 require.resolve 转换成 require('lodash/debounce');
const { debounce } = require('lodash');
```

在实现方式上，ES Modules 和 CommonJS 的处理方式是一致的，会将前者转换为 CommonJS 并保留必要的信息，然后将 CommonJS 处理成 AMD 格式，类似：

```js
define('foo/bar.js', ['./baz', 'react'], function(require, exports, module) {
  // 模块原始 CommonJS 代码
  // 或者 ES Modules 转换后的 CommonJS 代码
});
```

### interop

项目中 ES Modules 和 CommonJS 并存的时候，需要注意一些相互调用时容易产生的问题，比如：

```js
// card.jsx
export default function Card(props) {
  return <div></div>;
}

// app.js
import Card from './card';
// 如果是 CommonJS，需要手动读 exports.default
const { default: Card } = require('./card');
```

### Babel 转换

默认支持 .js、.jsx、.mjs、.cjs 扩展名，.jsx 需要配合 Babel 开启，在项目根目录创建 .babelrc 或者其他符合 Babel 配置文件名约定的文件即可。除了 JSX 需要 Babel，有一些比较新的用法也同样依赖，比如：

```js
// 类似 vite 的 glob import
const files = import.meta.glob('./data/*.json', { eager: true });

// 解析 worker 路径
const worker = new Worker(new URL('./worker.js', import.meta.url));

// 自动处理缩进的行内长文本
const text = heredoc(function() {/*
  <!doctype html>
  <html>
    <head></head>
    <body></body>
  </html>
*/});
```

因此实际上 Babel 是必须而非可选配置，未来 Porter 切换代码转换器时可能调整这部分的配置，但项目代码所支持的编写方式会保持不变。

### import.meta.glob

### import.meta.url

import.meta.url 应该是目前浏览器唯一支持的 [import.meta](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import.meta) 中的属性，可以用来读取当前模块的 URL，通常可以用在解析动态依赖的 URL 上，比如 Web Worker 或者 WebAssembly：

```js
const url = new URL('./hello.wasm', import.meta.url);
const result = await WebAssembly.instantiate(url);
result.instance.exports.greet('wasm');
```

如果你用的是 wasm-bindgen，倒是不用这么麻烦，可以直接 [import wasm]({{ '/zh/wasm' | relative_url }})。

### heredoc

源代码中如果用到 heredoc 来声明长文本，在转换后会被替换成长文本本身，并去除依赖中的 heredoc，例如：

```js
import heredoc from 'heredoc';
const text = heredoc(function() {/*
  <!doctype html>
  <html>
    <head></head>
    <body></body>
  </html>
*/});
```

会被替换为下面这个字符串，默认去掉首尾空白字符，并调整缩进：

```js
const text = `<!doctype html>
<html>
  <head></head>
  <body></body>
</html>`;
```

还可以传一个参数，将这个字符串转成一行，去除每一行字符串首尾的空白字符，再移除换行符：

```js
const text = `<!doctype html><html><head></head><body></body></html>`;
```

引入的 heredoc 依赖也会被一并移除。

## JSON 模块

支持引入 .json 文件：

```js
import a from './data/a.json';
console.loa(a);
```

相关文件内容会被内联到 JavaScript 构建产物中，类似下面这种方式：

```js
define('data/a.json', { ...data });
define('app.js', ['./data/a.json'], function(require) {
  const a = interop(require('./data/a.json'));
  console.log(a);
});
```

## TypeScript 模块

支持 .ts、.tsx、.d.ts 扩展名，默认使用 tsc 编译 TypeScript，好处是类型严格校验，坏处是目前的实现只会过一次 tsc，不会像 webpack 那样还会额外过一次 Babel 来处理 webpack 内部逻辑，也就是说，前文提及的 import.meta.glob、heredoc 等特殊处理在 TypeScript 中都没有。.d.ts 扩展名的文件只会在依赖解析阶段被读取，tsc 编译会移除掉仅引入类型的依赖，Porter 会在这个阶段排除掉 .d.ts 文件，避免这些运行时无关的文件被打包到构建产物中去。

理论上也可以用 Babel 或者其他代码转换器来处理 TypeScript 编译，从而统一两种模块的处理方式，暂时放到 v5 规划中。

## CSS 模块

可以将 CSS 模块作为单独的入口模块，在 HTML 中直接引用：

```html
<link rel="stylesheet" href="app.css">
```

也可以在 JavaScript 模块中声明依赖，让 Porter 帮助提取 JavaScript 依赖树中引入的所有 CSS，最终合并到如 JavaScript 入口模块同名的 CSS 文件中去：

```js
// dialog.js
import './dialog.css';
export default function Dialog() {}

// app.js
import Dialog from './dialog';
import './app.css';
```

将会生成如下 app.css 文件（`@import` 会被对应文件的实际内容替换）：

```css
@import './dialog.css';
@import './app.css';
```

### CSS Modules

支持获取 CSS exports：

```js
import styles from './app.module.css';
function App() {
  return <div className={styles.container}></div>;
}
```

暂时仅支持使用 .module.css 扩展名来标记当前 CSS 文件用法为 CSS Modules，并且 CSS Modules 使用 Lightning CSS 而非 PostCSS 来处理 CSS 源代码，转换产物可能有所出入，并且浏览器兼容性要比 PostCSS 差许多，会在 v4 重点解决。

## Less 模块

支持 .less 模块，会调用 Less.js 将 Less 代码转换为 CSS，继而按照 CSS 模块来处理，因此 CSS 模块特性在 Less 模块中也全部支持。依赖解析方式和 JavaScript 模块一致，相比 CSS 模块，Less 模块的依赖解析多了一个 webpack 扩展的语法：

```css
@import '~cropper/dist/cropper.css';
```

`~` 开头的依赖为 NPM 依赖，会直接去 node_modules 查找去除开头的 `~` 之后的依赖名；如果不写 `~`，下面这种代码的处理逻辑其实也是一样的：

```css
@import 'cropper/dist/cropper.css';
```

## Sass 模块

支持 .sass、.scss 模块，使用 sass 模块编译 Sass 或者 SCSS 代码（官方文档中的 Sass 和 SCSS 大小写也是如此），同样支持基础的 CSS 模块特性。

## WebAssembly 模块

详见 [WebAssembly]({{ '/zh/wasm' | relative_url }}) 一文。
