'use strict';

const crypto = require('crypto');
const debug = require('debug')('porter');
const path = require('path');
const UglifyJS = require('uglify-js');
const { promises: { readFile } } = require('fs');

const Module = require('./module');
const matchRequire = require('./match_require');

module.exports = class JsModule extends Module {
  matchImport(code) {
    const { package: pkg } = this;

    return matchRequire.findAll(code).filter(dep => {
      return pkg.browser[dep] !== false && dep !== 'heredoc';
    });
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
    const deps = this.deps || this.matchImport(code);

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

  async _transpile({ code, }) {
    const { fpath, package: pkg, app } = this;
    const babel = pkg.transpiler === 'babel' && pkg.tryRequire('@babel/core');
    if (!babel) return;

    /**
     * `babel.transform` finds presets and plugins relative to `fpath`. If `fpath`
     * doesn't start with pkg.dir, it's quite possible that the needed presets or
     * plugins might not be found.
     */
    if (!fpath.startsWith(pkg.dir)) return;

    const transpilerOptions = {
      ...pkg.transpilerOpts,
      sourceMaps: true,
      sourceRoot: '/',
      ast: false,
      filename: fpath,
      filenameRelative: path.relative(app.root, fpath),
      sourceFileName: path.relative(app.root, fpath),
      cwd: app.root,
    };
    return await babel.transform(code, transpilerOptions);
  }

  uglify({ code, map }) {
    const { fpath } = this;
    const source = path.relative(this.package.app.root, fpath);

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
