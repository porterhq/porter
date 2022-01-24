'use strict';

const debug = require('debug')('porter');
const Module = require('./module');
const { MODULE_LOADED } = require('./constants');

module.exports = class Stub extends Module {
  constructor(options) {
    super(options);
    debug('unknown file type', options.fpath);
  }

  async parse() {
    this.status = MODULE_LOADED;
  }

  async load() {
    return {};
  }

  async transpile() {
    return {};
  }

  async minify() {
    return {};
  }
};
