# examples/hello_world

> source code copied from <https://github.com/rustwasm/wasm-bindgen/tree/main/examples/hello_world>

Generate the contents at pkg/ with following command:

```bash
$ cargo install wasm-bindgen-cli
$ cargo build --release --target wasm32-unknown-unknown
$ wasm-bindgen --target bundler --out-dir pkg/bundler --out-name index ./target/wasm32-unknown-unknown/release/hello_world.wasm --omit-imports
```

To test Porter compatibility with `wasm-bindgen --target web`, use following command:

```bash
$ wasm-bindgen --target web --out-dir pkg/web --out-name index ./target/wasm32-unknown-unknown/release/hello_world.wasm --omit-imports
```

If the `wasm-bindgen` panics with error like index out of bound, please check the installed `wasm-bindgen-cli` and the version of `wasm-bindgen` in Cargo.toml matches.
