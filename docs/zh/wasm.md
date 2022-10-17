---
layout: zh
title: WebAssembly
---

## 目录
{:.no_toc}

1. 目录
{:toc}

## 使用方式

支持编译到 WebAssembly 的编程语言有很多，本文主要讨论如何在 Porter 项目中使用 wasm-bindgen 构建产物。wasm-bindgen 是一个用来处理 Rust 编译的 wasm 模块和 JS 胶水层的 Rust 工具，使用方式大致如下：

```bash
$ cargo build --target wasm32-unknown-unknown --release
$ cargo install wasm-bindgen
$ wasm-bindgen --target bundler --out-dir pkg --out-name index ./target/wasm32-unknown-unknown/release/hello_world.wasm
```

第三条命令的作用是生成 wasm 构建产物、所需的 js 胶水代码到 `--out-dir` 指定的目录。

### wasm-bindgen --target bundler

官方文档说目前只有 webpack 支持 --target bundler，其实 Porter 现在也支持了，相关生成产物可以在 JavaScript 中直接 import：

```js
import { greet } from 'hello-wasm';
greet('wasm');
```

### wasm-bindgen --target web

在 bundler 之前，wasm-bindgen 支持的构建产物格式是 web，用起来差别也不大：

```bash
wasm-bindgen --target web --out-dir pkg --out-name index ./target/wasm32-unknown-unknown/release/hello_world.wasm
```

需要在调用模块代码之前，先手动初始化一下模块代码：

```js
import init, { greet } from 'hello-wasm';
// 会在这一步请求并实例化 .wasm 文件
await init();
// 然后就可以调用 wasm exports 里的方法
greet();
```

## 实现方式

### 胶水代码

通过 `--out-name` 指定文件名后，会有两个关联文件，index_bg.wasm 和 index_bg.js，后者大致包含：

```javascript
import * as wasm from './index_bg.wasm';

/**
* @param {string} name
*/
export function greet(name) {
    var ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.greet(ptr0, len0);
}

export function __wbg_alert_e4f89deb17f7e8ca(arg0, arg1) {
    alert(getStringFromWasm0(arg0, arg1));
};
```

其中 `__wbg_`开头的函数是胶水代码，存在于 index_bg.js，在实例化 index_bg.wasm 时也需要用到，在调用 `WebAssembly.instantiate(module, imports)`时，需要根据相关信息提前准备好相关的 imports，不然会报下面这种错误：

```javascript
TypeError: WebAssembly.Instance(): Import #0 module="wasi_unstable" error: module is not an object or function
```

> module is not an object or function

### JavaScript imports

wasm-bindgen 支持使用 `#[wasm_bindgen]` 的扩展属性配置 WebAssembly 模块的 JavaScript imports，会在最终生成的 .wasm 文件中插入依赖信息，类似：

```javascript
(import "./index_bg.js __wbg_alert_e4f89deb17f7e8ca::[hash])
```

参考 wasm-bindgen 的 [JS Snippets](https://rustwasm.github.io/docs/wasm-bindgen/reference/js-snippets.html) 和 `#[wasm_bidgen(module="wu/tang/clan")]` [module 属性](https://rustwasm.github.io/wasm-bindgen/reference/attributes/on-js-imports/module.html)，实际组合方式比较灵活，还需要进一步验证相关使用方式。
