'use strict';

const MODULE_INIT = 0;
const MODULE_LOADING = 1;
const MODULE_LOADED = 2;

const rModuleId = /^((?:@[^\/]+\/)?[^\/]+)(?:\/(\d+\.\d+\.\d+[^\/]*))?(?:\/(.*))?$/;

const EXTENSION_MAP ={
  '.js': [ '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json' ],
  '.wasm': [ '.wasm' ],
  '.css': [ '.css', '.less' ],
};

module.exports = {
  MODULE_INIT,
  MODULE_LOADING,
  MODULE_LOADED,

  EXTENSION_MAP,

  rModuleId,
};
