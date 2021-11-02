'use strict';

const crypto = require('crypto');
const debug = require('debug')('porter');
const path = require('path');
const UglifyJS = require('uglify-js');
const { readFile } = require('mz/fs');

const Module = require('./module');
const deheredoc = require('../lib/deheredoc');
const matchRequire = require('../lib/match_require');

module.exports = class JsModule extends Module {
  matchImport(code) {
    return matchRequire.findAll(code);
  }

  /**
   * (partially) handle browserify.transform in package.json
   * @param {string} fpath
   * @param {string} code
   */
  async browserify(fpath, code) {
    const { package: pkg } = this;
    const transforms = (pkg.browserify && pkg.browserify.transform) || [];
    const whitelist = ['envify', 'loose-envify', 'brfs'];
    let stream;

    for (const name of transforms) {
      if (whitelist.includes(name)) {
        const factory = name == 'envify' || name == 'loose-envify'
          ? require('loose-envify')
          : pkg.tryRequire(name);
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
    if (this.loaded) return;
    this.loaded = true;

    const { package: pkg } = this;
    const { code } = await this.load();
    let deps = this.deps || this.matchImport(code).filter(dep => pkg.browser[dep] !== false);

    const fpath = path.join(pkg.app.cache.dest, this.id);
    const cache = await readFile(`${fpath}.cache`, 'utf8').catch(() => {});

    if (cache) {
      const data = JSON.parse(cache);
      if (data.digest === crypto.createHash('md5').update(code).digest('hex')) {
        this.cache = data;
      }
    }

    await Promise.all(deps.map(this.parseDep, this));
  }

  async load() {
    const { fpath } = this;
    const source = this.code || await readFile(fpath, 'utf8');
    const code = await this.browserify(fpath, source);
    return { code };
  }

  async transpile({ code, map }) {
    const { id, deps } = this;
    let result;

    try {
      result = await this._transpile({ code, map });
    } catch (err) {
      debug('unable to transpile %s', this.fpath);
      throw err;
    }

    // if fpath is ignored, @babel/core returns nothing
    if (result) {
      code = result.code;
      map = result.map;
    }

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
    const deps = this.deps || this.matchImport(code);
    for (let i = deps.length - 1; i >= 0; i--) {
      if (deps[i].endsWith('heredoc')) deps.splice(i, 1);
    }
    this.deps = deps;
    this.addCache(code, {
      ...this.tryUglify(await this.transpile({ code, map })),
      minified: true
    });

    return this.cache;
  }

  async _transpile({ code, }) {
    const { fpath, package: pkg } = this;
    const babel = pkg.transpiler === 'babel' && pkg.tryRequire('@babel/core');
    if (!babel) return;

    /**
     * `babel.transform` finds presets and plugins relative to `fpath`. If `fpath`
     * doesn't start with pkg.dir, it's quite possible that the needed presets or
     * plugins might not be found.
     */
     if (!fpath.startsWith(pkg.dir)) return;

    return await babel.transform(code, {
      ...pkg.transpilerOpts,
      sourceMaps: true,
      sourceRoot: '/',
      ast: false,
      filename: fpath,
      filenameRelative: path.relative(pkg.dir, fpath),
      sourceFileName: path.relative(pkg.dir, fpath),
      // root: pkg.dir
    });
  }

  tryUglify({ code, map }) {
    try {
      return this.uglify({ code, map }, UglifyJS);
    } catch (err) {
      return this.uglify({ code, map }, require('uglify-es'));
    }
  }

  uglify({ code, map }, uglifyjs) {
    const { fpath } = this;
    const source = path.relative(this.package.app.root, fpath);
    const parseResult = uglifyjs.minify({ [source]: code }, {
      parse: {},
      compress: false,
      mangle: false,
      output: { ast: true, code: false }
    });

    if (parseResult.error) {
      const err = parseResult.error;
      throw new Error(`${err.message} (${err.filename}:${err.line}:${err.col})`);
    }

    const result = uglifyjs.minify(deheredoc(parseResult.ast), {
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

    if (result.error) {
      const err = result.error;
      throw new Error(`${err.message} (${err.filename}:${err.line}:${err.col})`);
    }
    return result;
  }
};
