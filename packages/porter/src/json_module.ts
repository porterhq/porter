'use strict';

import { readFile } from 'fs/promises';
import Module, { ModuleOptions } from './module';
import { MODULE_LOADED } from './constants';

export default class JsonModule extends Module {
  constructor(options: ModuleOptions) {
    super(options);
    this.code = options.code;
  }

  async parse() {
    // nothing to parse here, just pure json data
    this.status = MODULE_LOADED;
  }

  matchImport() {
    return [];
  }

  async load() {
    const { fpath } = this;
    const code = this.code || await readFile(fpath, 'utf8');
    return { code };
  }

  async transpile() {
    const { id } = this;
    const { code } = await this.load();

    return {
      code: `porter.define(${JSON.stringify(id)}, ${code.trim()})`,
    };
  }

  async minify() {
    return this.transpile();
  }
};
