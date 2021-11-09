'use strict';

const path = require('path');
const { promises: { readFile } } = require('fs');

const Module = require('./module');

const rAtImport = /(?:^|\n)\s*@import\s+(['"])([^'"]+)\1;/g;

module.exports = class CssModule extends Module {
  matchImport(code) {
    const deps = [];
    let m;

    rAtImport.lastIndex = 0;
    while ((m = rAtImport.exec(code))) {
      deps.push(m[2]);
    }

    return deps;
  }

  /**
   * Parse the module code and contruct dependencies. Unlike {@link JsModule}, CssModule uses the original code to parse dependencies instead because the code returned by {@link CssModule#load} would have `@import`s expanded and replaced.
   */
  async parse() {
    if (this.loaded) return;
    this.loaded = true;

    const { fpath } = this;
    const code = this.code || (await readFile(fpath, 'utf8'));
    const deps = this.deps || this.matchImport(code);

    await Promise.all(deps.map(this.parseDep, this));
  }

  async load() {
    const { fpath } = this;
    const code = this.code || await readFile(fpath, 'utf8');

    const { id } = this;
    const { cssLoader, root } = this.package.app;

    /**
     * `from` must be absolute path to make sure the `baseDir` in
     * `atImportResolve()` function is correct. Otherwise it will be set to
     * process.cwd() which might not be `root` in some circumstances. Luckily
     * we've got `map.from` to specify the file path in source map.
     * - http://api.postcss.org/global.html#processOptions
     */
    const { css, map } = await cssLoader.process(code, {
      from: fpath,
      to: id,
      map: {
        inline: false,
        from: path.relative(root, fpath),
        sourcesContent: false
      }
    });

    return { code: css, map: map.toJSON() };
  }

  async transpile({ code, map }) {
    const { fpath, id } = this;
    const { cssTranspiler, root } = this.package.app;

    /**
     * PostCSS doesn't support sourceRoot yet
     * https://github.com/postcss/postcss/blob/master/docs/source-maps.md
     */
    const result = await cssTranspiler.process(code, {
      from: fpath,
      to: id,
      map: {
        inline: false,
        prev: map,
        from: path.relative(root, fpath),
        sourcesContent: false
      }
    });

    map = JSON.parse(result.map);
    map.sourceRoot = '/';

    return { code: result.css, map };
  }

  async minify() {
    const { code, map } = await this.load();
    return this.transpile({ code, map });
  }
};
