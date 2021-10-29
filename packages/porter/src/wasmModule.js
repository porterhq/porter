'use strict';

const Module = require('./module');
const { readFile } = require('mz/fs');

module.exports = class WasmModule extends Module {
  get isolated() {
    return true;
  }

  get pristine() {
    return true;
  }

  async parse() {
    // unnecessary
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
