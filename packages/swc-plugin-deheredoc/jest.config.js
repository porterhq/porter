'use strict';

module.exports = {
  rootDir: __dirname,
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          experimental: {
            plugins: [
              [
                require.resolve(
                  './target/wasm32-wasi/debug/swc_plugin_porter.wasm'
                ),
                {
                  basePath: __dirname,
                  displayName: true,
                },
              ],
            ],
          },
        },
      },
    ],
  },
};
