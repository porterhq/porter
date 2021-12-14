'use strict';

const crypto = require('crypto');
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

    return matchRequire.findAll(code).filter(dep => {
      return packet.browser[dep] !== false && dep !== 'heredoc';
    });
  }

  /**
   * (partially) handle browserify.transform in package.json
   * @param {string} fpath
   * @param {string} code
   */
  async browserify(fpath, code) {
    const { packet } = this;
    const transforms = (packet.browserify && packet.browserify.transform) || [];
    const whitelist = ['envify', 'loose-envify', 'brfs'];
    let stream;

    for (const name of transforms) {
      if (whitelist.includes(name)) {
        const factory = name == 'envify' || name == 'loose-envify'
          ? require('loose-envify')
          : packet.tryRequire(name);
        const transform = factory(fpath, {
          RBOWSER: true,
          NODE_ENV: process.env.NODE_ENV || 'development',
        });
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
    const deps = this.deps || this.matchImport(code);

    const cachePath = path.join(app.cache.dest, `${this.id}.cache`);
    const cache = await readFile(cachePath, 'utf8').catch(() => {});

    if (cache) {
      let data = {};
      try {
        data = JSON.parse(cache);
      } catch (err) {
        console.warn(new Error(`cache broken ${path.relative(app.root, cachePath)}`));
      }
      if (data.digest === crypto.createHash('md5').update(code).digest('hex')) {
        this.cache = data;
      } else {
        debug(`cache invalidated ${path.relative(app.root, cachePath)}`);
      }
    }

    const result = await Promise.all(deps.map(this.parseDep, this));
    this.children = result.filter(mod => !!mod);
    this.status = MODULE_LOADED;
  }

  async load() {
    const { fpath, app } = this;
    // fake entries will provide code directly
    const source = this.code || await readFile(fpath, 'utf8');
    let code = await this.browserify(fpath, source);
    if (app.transpile.namedImport) {
      for (const options of [].concat(app.transpile.namedImport)) {
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
      const { deps } = this;
      // @babel/runtime
      this.deps = this.matchImport(result.code);
      for (const dep of this.deps) {
        if (!deps.includes(dep)) await this.parseDep(dep);
      }
      code = result.code;
      map = result.map;
    }

    const { id, deps } = this;
    return {
      code: [
        `define(${JSON.stringify(id)}, ${JSON.stringify(deps)}, function(require, exports, module, __module) {${code}`,
        '})'
      ].join('\n'),
      map
    };
  }

  async minify() {
    if (this.cache && this.cache.minified) return this.cache;

    const { code, map } = await this.load();
    this.deps = this.deps || this.matchImport(code);
    this.addCache(code, {
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
