'use strict';

const { promises: { readFile } } = require('fs');
const { MODULE_LOADED } = require('./constants');
const Module = require('./module');

module.exports = class WasmModule extends Module {
  get isolated() {
    return true;
  }

  get pristine() {
    return true;
  }

  async parse() {
    // unnecessary
    this.status = MODULE_LOADED;
  }

  matchImport() {
    return [];
  }

  async load() {
    const { fpath } = this;
    const code = this.code || await readFile(fpath);
    return { code };
  }

  async transpile({ code }) {
    return { code };
  }

  async minify() {
    return await this.load();
  }
};
