import fs from 'fs/promises';
import path from 'path';
import css from '@parcel/css';

import Module, { TranspileOptions } from './module';
import JsonModule from './json_module';
import { MODULE_LOADING, MODULE_LOADED } from './constants';

// FIXME
// switch to swc css or lightning css perhaps?
const rAtImport = /(?:^|\n)\s*@import\s+(?:(['"])([^'"]+)\1|url\((['"])?([^\)]+)\3?\));/g;

export default class CssModule extends Module {
  exports?: JsonModule;

  matchImport(code: string) {
    const imports = [];
    let m;

    rAtImport.lastIndex = 0;
    while ((m = rAtImport.exec(code))) {
      imports.push(m[2] || m[4]);
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

    // precedence matters in css modules
    const result = await Promise.all(this.imports!.map(this.parseImport, this));
    this.children = result.filter(mod => mod != null) as Module[];
    this.status = MODULE_LOADED;
  }

  async load() {
    const { fpath } = this;
    const code = await fs.readFile(fpath, 'utf8');
    return { code };
  }

  async _transpile(options: TranspileOptions) {
    const { fpath, app } = this;
    const { cssTranspiler } = app;

    /**
     * PostCSS doesn't support sourceRoot yet
     * https://github.com/postcss/postcss/blob/master/docs/source-maps.md
     */
    const result = await cssTranspiler.process(options.code, {
      from: fpath,
      map: {
        // https://postcss.org/api/#sourcemapoptions
        inline: false,
        annotation: false,
        absolute: true,
        prev: options.map,
      }
    });

    const map = 'toJSON' in result.map ? result.map.toJSON() : JSON.parse(result.map);
    map.sources = map.sources.map((source: string) => {
      return `porter:///${path.relative(app.root, source.replace(/^file:/, ''))}`;
    });

    return { code: result.css, map };
  }

  async transpile(options: TranspileOptions) {
    const { file, fpath, packet, app } = this;
    const cssModules = /\.module\.(?:css|scss|sass|less)$/.test(fpath);
    // parcel css doesn't transpile nesting rules against targets correctly yet
    if (!cssModules) return await this._transpile(options);

    const { code, map, minify = false } = options;
    if (!app.targets) app.targets = css.browserslistToTargets(app.browsers) as Record<string, number>;

    let result;
    try {
      result = css.transform({
        filename: `porter:///${path.relative(app.root, fpath)}`,
        code: Buffer.from(code),
        minify,
        sourceMap: true,
        analyzeDependencies: true,
        cssModules,
        drafts: {
          nesting: true,
          customMedia: true,
        },
        targets: app.targets,
      });
    } catch (err) {
      const { data, source, loc } = err as (Error & { data: Record<string, any>, source: string, loc: { line: number, column: number } });
      let line = source.split('\n')[loc.line - 1];
      let column = loc.column;
      if (line.length > 2058) {
        column = 128;
        line = `... ${line.slice(Math.max(0, loc.column - 128), Math.min(loc.column + 128, line.length))}`;
      }
      console.error(`${data.type}: ${data.value.type} (${path.relative(process.cwd(), fpath)})

      ${line}
      ${' '.repeat(column - 1)}↑`);
      return { code, map };
    }

    const { exports, dependencies = [] } = result;

    if (exports) {
      const mapping: Record<string, string> = {};
      for (const key in exports) mapping[key] = exports[key].name;
      this.exports = new JsonModule({ file, fpath, packet, code: JSON.stringify(mapping) });
    }

    let resultCode = result.code.toString();
    for (const dep of dependencies) {
      if (dep.type === 'url') {
        resultCode = resultCode.replace(dep.placeholder, dep.url);
      }
    }

    return {
      code: resultCode,
      map: JSON.parse(result.map!.toString()),
    };
  }

  async minify() {
    if (this.cache && this.cache.minified) return this.cache;
    const { code, } = await this.load();
    this.setCache(code, {
      ...await this.transpile({ code, minify: true }),
      minified: true,
    });
    return this.cache!;
  }
};
