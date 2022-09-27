'use strict';

// const path = require('path');
const sass = require('sass');
const { pathToFileURL } = require('url');
const CssModule = require('./css_module');

module.exports = class SassModule extends CssModule {
  matchImport(code) {
    // leave imports to sass compiler
    this.imports = [];
  }

  async transpile({ code, map, minify }) {
    const { fpath, packet } = this;
    const loadPaths = packet.paths || [ packet.dir ];

    const result = await sass.compileStringAsync(code, {
      loadPaths,
      url: pathToFileURL(fpath),
      importers: [{
        findFileUrl: async (url) => {
          const mod = await this.parseImport(url);
          return mod ? pathToFileURL(mod.fpath) : null;
        },
      }],
    });

    return super.transpile({ code: result.css, map: result.sourceMap, minify });
  }
};
