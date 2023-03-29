---
layout: en
title: WebAssembly
---

## Table of Contents
{:.no_toc}

1. Table of Contents
{:toc}

## Usage

WebAssembly is a binary instruction format, which means many programming language can have it as the compile target. This article is mostly about using wasm-bindgen with Porter. wasm-bindgen is a compiler in Rust that is able to compile Rust code into wasm modules.

If you've got rustup already, you can start with following commands:

```bash
$ cargo build --target wasm32-unknown-unknown --release
$ cargo install wasm-bindgen
$ wasm-bindgen --target bundler --out-dir pkg --out-name index ./target/wasm32-unknown-unknown/release/hello_world.wasm
```

wasm-bindgen will generate the wasm module, the glue code needed to interop with the JavaScript land, and put them in the directory specified by `--out-dir`.

### wasm-bindgen --target bundler

Unlike the claims in the official documentation of wasm-bindgen, Porter also supports its `--target bundler` option. The output package can be imported directly:

```js
import { greet } from 'hello-wasm';
greet('wasm');
```

### wasm-bindgen --target web

The web target is supported also, although a little glue code is needed when using the output package:

```bash
wasm-bindgen --target web --out-dir pkg --out-name index ./target/wasm32-unknown-unknown/release/hello_world.wasm
```

You'll need to init the wasm module before actually invoking any exported api:

```js
import init, { greet } from 'hello-wasm';
// 会在这一步请求并实例化 .wasm 文件
await init();
// 然后就可以调用 wasm exports 里的方法
greet();
```

## Implementation Details

### Glue Code

wasm-bindgen generates at least two files, with the name specified by `--out-name`, such as index_bg.wasm and index_bg.js, with the latter one like:

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

The functions starting with `__wbg_` are glue code, some of them are need when instantiating the wasm module with `WebAssembly.instantiate(module, imports)`, otherwise there might be Error like below:

```javascript
TypeError: WebAssembly.Instance(): Import #0 module="wasi_unstable" error: module is not an object or function
```

> module is not an object or function

### JavaScript imports

You can use the `#[wasm_bindgen]` feature to declare JavaScript imports, which will be prepended into the .wasm file, such as:

```javascript
(import "./index_bg.js __wbg_alert_e4f89deb17f7e8ca::[hash])
```

Please refer to the [JS Snippets](https://rustwasm.github.io/docs/wasm-bindgen/reference/js-snippets.html) and `#[wasm_bidgen(module="wu/tang/clan")]` [module attribute](https://rustwasm.github.io/wasm-bindgen/reference/attributes/on-js-imports/module.html) in wasm-bidngen for more introductions.
