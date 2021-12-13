'use strict';

const MODULE_INIT = 0;
const MODULE_LOADING = 1;
const MODULE_LOADED = 2;

const rModuleId = /^((?:@[^\/]+\/)?[^\/]+)(?:\/(\d+\.\d+\.\d+[^\/]*))?(?:\/(.*))?$/;

module.exports = {
  MODULE_INIT,
  MODULE_LOADING,
  MODULE_LOADED,

  rModuleId,
};
