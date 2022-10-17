---
layout: zh
title: 动态加载
---

## 目录
{:.no_toc}

1. 目录
{:toc}

## 使用方式

可以在 ES Module 中使用 `import(specifier)` 语法来动态加载代码，支持类似下面这些用法：

```js
const Component = React.lazy(() => import('./component'));
import('./dialog').then(exports => exports.modal(...options));
// top level await is only available in es modulesp
const cla = await import('./cla);
```

因为实现的关系，`import(specifier)` 在 CommonJS 中也可以用，推荐用来替换原先的 `require.async(specifier, callback)` 用法，因为前者不仅会动态加载代码，而且在构建阶段也会自动拆包，而后者需要手动配置。

### 动态加载路由表

单页应用中比较常见下面这种用法来实现页面的动态加载：

```js
const routes = {
  '/': () => import('./home'),
  '/about': () => import('./about'),
};
window.addEventListener('hashchange', function() {
  const page = location.hash.slice(1);
  const component = routes[page];
  component().then(exports => mount(exports.default));
});
```

上面这种写法是没问题的，需要注意不能改成下面这种写法：

```js
// BROKEN
const routes = ['/home', '/about'].reduce((result, pathname) => {
  return result[pathname] = () => import(pathname.slice(1));
}, {});
```

`import(specifier)` 中传入的 specifier 如果是 JavaScript 变量而不是字符串字面量，会导致 Porter 无法解析此处动态加载的依赖关系，也就没有办法得知这段代码还依赖 home.js 和 about.js。

### 动态加载入口模块

如果页面有多个入口模块（在多页应用中常见），有可能出现入口模块互相之间有依赖的情况，比如列表页面和编辑页面：

```js
// edit.js
export function Editor() {}
export default function App() {}

// list.js
document.querySelector('button#edit').addEventListener('click', function onClick() {
  import('./edit').then(({ Editor }) => {
    const editor = new Editor();
    editor.open(data);
  });
});
```

这种情况下，不同入口模块的代码仍然是分别打包的，并且 list.js 能够在执行到 `import('./edit')` 时找到正确的 edit.js 构建产物，从而加载对应的代码，并返回对应模块输出的 `exports.Editor`。

## 实现方式

### Babel 转换

Babel 支持解析并转换 `import(specifier).then(exports => {})`这种代码，转换结果很长一串（可以戳[这个 repl 链接](https://babeljs.io/repl/#?browsers=defaults%2C%20not%20ie%2011%2C%20not%20ie_mob%2011&build=&builtIns=false&corejs=3.21&spec=false&loose=false&code_lz=JYWwDg9gTgLgFAcgHQHoBmEIIJRJgCwFMA7ONAV2IGMZgJTCAPSWAZ2wAIBvDq-1iABtCSQRADmcJixiskAE0JoAhuUExOAX2wBuAFBA&debug=false&forceAllTransforms=false&shippedProposals=false&circleciRepo=&evaluate=false&fileSize=false&timeTravel=false&sourceType=module&lineWrap=true&presets=env%2Creact%2Cstage-2&prettier=false&targets=&version=7.17.6&externalPlugins=&assumptions=%7B%7D)预览），实际上转变的部分不多，大致如下：

```javascript
import('react').then(({ default: React }) => <App />);
// ->
require('react').then(({ default: React }) => React.createElement(App));
```

并且会确保 require 调用的是全局变量（会将局部变量中可见的 require 都替换成其他名字），换句话说，就是打包工具实现的 `require(specifier)` 只要能够判断 `specifier` 所指的依赖是动态依赖，如果是动态依赖就发起模块请求并返回 `Promise.resolve(exports)` 即可。

被默认集成到 @babel/preset-env 的插件有两个，分别是 @babel/plugin-syntax-dynamic-import 和 @babel/plugin-proposal-dynamic-import，看名字是前者处理语法解析，后者处理代码转换。这也意味着，开启 Babel 的前端工程默认就会按上述规则转换 `import(specifier)`。

### loader.js

Porter 中的 loader.js 单论复杂度介于传统模块加载器比如 RequireJS 和打包工具专门的模块加载器比如 Webpack 的机器生成代码之间，能够给模块代码的执行上下文传一个全局的 `require(specifier)`，参考上一章节分析的内容，可以按照如下逻辑实现：

```javascript
if (!dep && typeof Promise === 'function') {
  // eslint-disable-next-line no-shadow
  return Object.assign(new Promise(function(resolve, reject) {
    require.async(specifier, resolve);
    setTimeout(function() {
      reject(new Error('import(' + JSON.stringify(specifier) + ') timeout'));
    }, system.timeout);
  }), { __esModule: true });
}
```
> [https://github.com/porterhq/porter/pull/135/files#diff-0fdfc7a22be0fda47ce296578391449a17e5e735005ca0d729180b9c06170c94](https://github.com/porterhq/porter/pull/135/files#diff-0fdfc7a22be0fda47ce296578391449a17e5e735005ca0d729180b9c06170c94)

`require.async(specifier)` 会分析 specifier 找到完整的模块 id，继而判断模块关联的 bundle 是否存在，如果存在，就会尝试加载脚本（网页中是动态插入 `<script>`、Worker 中是 `importScripts()`）
