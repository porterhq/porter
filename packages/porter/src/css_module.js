'use strict';

const fs = require('fs/promises');
const path = require('path');

const Module = require('./module');
const { MODULE_LOADING, MODULE_LOADED } = require('./constants');

const rAtImport = /(?:^|\n)\s*@import\s+(['"])([^'"]+)\1;/g;

module.exports = class CssModule extends Module {
  matchImport(code) {
    const imports = [];
    let m;

    rAtImport.lastIndex = 0;
    while ((m = rAtImport.exec(code))) {
      imports.push(m[2]);
    }

    this.imports = imports;
  }

  /**
   * Parse the module code and contruct dependencies. Unlike {@link JsModule}, CssModule uses the original code to parse dependencies instead because the code returned by {@link CssModule#load} would have `@import`s expanded and replaced.
   */
  async parse() {
    if (this.status === MODULE_LOADING) return;
    this.status = MODULE_LOADING;

    const { fpath } = this;
    const code = this.code || (await fs.readFile(fpath, 'utf8'));
    if (!this.imports) this.matchImport(code);

    // ordering matters in css modules
    const result = await Promise.all(this.imports.map(this.parseImport, this));
    this.children = result.filter(mod => mod != null);
    this.status = MODULE_LOADED;
  }

  async load() {
    const { fpath } = this;
    const code = await fs.readFile(fpath, 'utf8');
    return { code };
  }

  async transpile({ code, map }) {
    const { fpath, app } = this;
    const { cssTranspiler } = app;

    /**
     * PostCSS doesn't support sourceRoot yet
     * https://github.com/postcss/postcss/blob/master/docs/source-maps.md
     */
    const result = await cssTranspiler.process(code, {
      from: fpath,
      path: this.app.paths,
      map: {
        // https://postcss.org/api/#sourcemapoptions
        inline: false,
        sourcesContent: false,
        annotation: false,
        absolute: true,
      }
    });

    map = JSON.parse(result.map);
    map.sourceRoot = '/';
    map.sources = map.sources.map(source => {
      return path.relative(app.root, source.replace(/^file:/, ''));
    });

    return { code: result.css, map };
  }

  async minify() {
    const { code, map } = await this.load();
    return this.transpile({ code, map });
  }
};
