'use strict';

const { promises: { readFile } } = require('fs');

const Module = require('./module');
const { MODULE_LOADED } = require('./constants');

module.exports = class JsonModule extends Module {
  async parse() {
    // nothing to parse here, just pure json data
    this.status = MODULE_LOADED;
  }

  matchImport() {
    return [];
  }

  async load() {
    const { fpath } = this;
    const code = await readFile(fpath, 'utf8');
    return { code };
  }

  async transpile() {
    const { id } = this;
    const { code } = await this.load();

    return {
      code: `define(${JSON.stringify(id)}, ${code.trim()})`,
    };
  }

  async minify() {
    return this.transpile();
  }
};
