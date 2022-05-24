'use strict';

// const path = require('path');
const sass = require('sass');
const CssModule = require('./css_module');

module.exports = class SassModule extends CssModule {
  matchImport(code) {
    // leave imports to sass compiler
    this.imports = [];
  }

  async transpile({ code, map, minify }) {
    const { packet } = this;
    const loadPaths = packet.paths || [ packet.dir ];

    const result = sass.compileString(code, {
      loadPaths,
    });

    return super.transpile({ code: result.css, map: result.sourceMap, minify });
  }
};
