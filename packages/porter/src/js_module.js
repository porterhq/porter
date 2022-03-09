'use strict';

const debug = require('debug')('porter');
const path = require('path');
const UglifyJS = require('uglify-js');
const { promises: { readFile } } = require('fs');

const Module = require('./module');
const matchRequire = require('./match_require');
const namedImport = require('./named_import');

const { MODULE_LOADING, MODULE_LOADED } = require('./constants');

module.exports = class JsModule extends Module {
  matchImport(code) {
    const { packet } = this;
    const { imports, dynamicImports } = matchRequire.findAll(code);
    function ignoreImport(specifier) {
      return packet.browser[specifier] !== false && specifier !== 'heredoc';
    }
    this.imports = imports.filter(ignoreImport);
    this.dynamicImports = dynamicImports.filter(ignoreImport);
  }


  /**
   * (partially) handle browserify.transform in package.json
   * @param {string} fpath
   * @param {string} code
   */
  async browserify(fpath, code) {
    const { packet } = this;
    const transforms = (packet.browserify && packet.browserify.transform) || [];
    const env = {
      RBOWSER: true,
      NODE_ENV: process.env.NODE_ENV || 'development',
    };
    const whitelist = ['envify', 'loose-envify', 'brfs'];
    let stream;

    for (const key in env) {
      if (code.includes(key) && !transforms.length) transforms.push('loose-envify');
    }

    for (const name of transforms) {
      if (whitelist.includes(name)) {
        const factory = name == 'envify' || name == 'loose-envify'
          ? require('loose-envify')
          : packet.tryRequire(name);
        const transform = factory(fpath, env);
        // normally `transform.end()` should return itself but brfs doesn't yet
        stream = stream ? stream.pipe(transform) : transform.end(code) || transform;
      }
    }

    if (!stream) return code;
    return new Promise(resolve => {
      let buf = '';
      stream.on('data', chunk => buf += chunk);
      stream.on('end', () => resolve(buf));
    });
  }

  /**
   * parse the module code and contruct dependencies.
   */
  async parse() {
    if (this.status >= MODULE_LOADING) return;
    this.status = MODULE_LOADING;

    const { app } = this;
    const { code } = await this.load();
    if (!this.imports) this.matchImport(code);
    this.cache = await app.cache.get(this.id, code);

    const imports = this.imports.concat(this.dynamicImports || []);
    const result = await Promise.all(imports.map(this.parseImport, this));
    this.children = result.filter(mod => !!mod);
    this.status = MODULE_LOADED;
  }

  async load() {
    const { fpath, app } = this;
    // fake entries will provide code directly
    const source = this.code || await readFile(fpath, 'utf8');
    let code = await this.browserify(fpath, source);
    if (app.resolve.import) {
      for (const options of [].concat(app.resolve.import)) {
        code = namedImport.replaceAll(code, options);
      }
    }
    return { code };
  }

  async transpile({ code, map }) {
    let result;

    try {
      result = await this._transpile({ code, map });
    } catch (err) {
      debug('unable to transpile %s', this.fpath);
      throw err;
    }

    // if fpath is ignored, @babel/core returns nothing
    if (result) {
      await this.checkImports({ code: result.code, intermediate: true });
      code = result.code;
      map = result.map;
    }

    const { id, imports } = this;
    return {
      code: [
        `define(${JSON.stringify(id)}, ${JSON.stringify(imports)}, function(require, exports, module, __module) {${code}`,
        '})'
      ].join('\n'),
      map
    };
  }

  async minify() {
    if (this.cache && this.cache.minified) return this.cache;

    const { code, map } = await this.load();
    if (!this.imports) this.matchImport(code);
    this.setCache(code, {
      ...this.uglify(await this.transpile({ code, map })),
      minified: true
    });

    return this.cache;
  }

  async _transpile({ code, map }) {
    const { fpath, packet, app } = this;
    const babel = packet.transpiler === 'babel' && packet.tryRequire('@babel/core');
    if (!babel) return { code, map };

    /**
     * `babel.transform` finds presets and plugins relative to `fpath`. If `fpath`
     * doesn't start with packet.dir, it's quite possible that the needed presets or
     * plugins might not be found.
     */
    if (!fpath.startsWith(packet.dir)) return;

    const transpilerOptions = {
      ...packet.transpilerOpts,
      sourceMaps: true,
      sourceRoot: '/',
      inputSourceMap: map,
      ast: false,
      filename: fpath,
      filenameRelative: path.relative(app.root, fpath),
      sourceFileName: path.relative(app.root, fpath),
      cwd: app.root,
    };
    return await babel.transform(code, transpilerOptions);
  }

  uglify({ code, map }) {
    const { fpath, app } = this;
    const source = path.relative(app.root, fpath);
    const { keep_fnames } = app.uglifyOptions || {};

    const result = UglifyJS.minify({ [source]: code }, {
      compress: {
        dead_code: true,
        global_defs: {
          process: {
            env: {
              BROWSER: true,
              NODE_ENV: process.env.NODE_ENV
            }
          }
        }
      },
      keep_fnames: keep_fnames instanceof RegExp ? keep_fnames.test(source) : keep_fnames,
      output: { ascii_only: true },
      sourceMap: {
        content: map,
        root: '/'
      }
    });

    if (result.error) throw result.error;
    return result;
  }
};
