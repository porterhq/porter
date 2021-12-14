'use strict';

const Module = require('./module');
const { MODULE_LOADED } = require('./constants');

module.exports = class Stub extends Module {
  async parse() {
    this.status = MODULE_LOADED;
  }
  async load() {
    return {};
  }
  async transpile() {
    return {};
  }
};
