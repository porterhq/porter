import Debug from 'debug';
import path from 'path';
import UglifyJS from 'uglify-js';
import fs from 'fs/promises';
import merge from 'lodash/merge';
import { transform, parseSync, Program } from '@swc/core';

import Module, { ModuleCache, SourceOptions, TranspileOptions } from './module';
import * as namedImport from './named_import';

import { MODULE_LOADING, MODULE_LOADED } from './constants';
import { RawSourceMap } from 'source-map';
import ImportVisitor from './import_visitor';
import { glob } from 'glob';

const debug = Debug('porter');

interface Stream {
  on: <T extends Stream>(this: T, event: string, callback: (chunk: string) => {}) => T;
  pipe: (stream: Stream) => Stream;
}

type Plugins = [string, Record<string, any>][];

function loadPlugins(): Plugins {
  const plugins = [
    'swc_plugin_deheredoc.wasm',
    'swc_plugin_glob_import.wasm',
    'swc_plugin_porter.wasm',
  ];
  return plugins.map(name => {
    let fpath = '';
    try {
      fpath = require.resolve(`../${name}`)
    } catch {
      fpath = require.resolve(`../../../target/wasm32-wasi/debug/${name}`);
    }
    return [fpath, { displayName: true }]
  });
}

let plugins: Plugins;

export default class JsModule extends Module {
  importVisitor = new ImportVisitor();

  mergeImports(imports: { source: string, pattern?: string }[]) {
    const { fpath, packet } = this;
    const result: string[] = [];
    for (const { source, pattern } of imports) {
      if (packet.browser[source] === false || source === 'heredoc') continue;
      if (pattern) {
        result.push(...glob.sync(pattern, { cwd: path.dirname(fpath) }))
      } else {
        result.push(source);
      }
    }
    return result;
  }

  matchImport(code: string) {
    const { app, file, fpath, importVisitor } = this;
    let program: Program;
    try {
      program = parseSync(code, {
        syntax: /\.tsx?/i.test(file) ? 'typescript' : 'ecmascript',
        tsx: true,
        jsx: true,
        decorators: true,
        decoratorsBeforeExport: true,
      });
    } catch (err) {
      if (err instanceof Error) {
        err.message = err.message.replace('Syntax Error', `Syntax Error (${path.relative(app.root, fpath)})`)
      }
      throw err;
    }
    importVisitor.visitProgram(program);
    const { imports, dynamicImports, __esModule } = importVisitor;
    this.imports = this.mergeImports(imports);
    this.dynamicImports = this.mergeImports(dynamicImports);
    if (this.__esModule == null) this.__esModule = __esModule;
  }

  /**
   * (partially) handle browserify.transform in package.json
   * @param {string} fpath
   * @param {string} code
   */
  async browserify(fpath: string, code: string): Promise<string> {
    const { packet } = this;
    const transforms = (packet.browserify && packet.browserify.transform) || [];
    const env = {
      RBOWSER: true,
      NODE_ENV: process.env.NODE_ENV ?? 'development',
    };
    const whitelist = ['envify', 'loose-envify', 'brfs'];
    let stream: Stream | null = null;

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
        stream = stream != null ? stream.pipe(transform) : transform.end(code) || transform;
      }
    }

    return new Promise(resolve => {
      if (stream) {
        let buf = '';
        stream.on('data', (chunk: string) => buf += chunk);
        stream.on('end', async () => resolve(buf));
      } else {
        resolve(code);
      }
    });
  }

  /**
   * parse the module code and construct dependencies.
   */
  async parse() {
    if (this.status >= MODULE_LOADING) return;
    this.status = MODULE_LOADING;

    const { app, packet } = this;
    const { code } = await this.load();

    this.cache = await app.cache.get(this.id, code) as ModuleCache;

    if (!this.imports && this.cache) {
      this.imports = this.cache.imports;
      this.dynamicImports = this.cache.dynamicImports;
      this.__esModule = this.cache.__esModule;
    }
    if (!this.imports) this.matchImport(code);

    if (this.__esModule && !packet.transpiler) {
      packet.transpiler = app.packet.transpiler || 'swc';
      packet.transpilerOpts = app.packet.transpilerOpts;
    }

    const [ children, dynamicChildren ] = await Promise.all([
      Promise.all(this.imports!.map(this.parseImport, this)),
      Promise.all((this.dynamicImports || []).map(this.parseImport, this)),
    ]);

    this.children = children.concat(dynamicChildren).filter(mod => !!mod) as Module[];
    this.dynamicChildren = dynamicChildren.filter(mod => !!mod) as Module[];
    this.status = MODULE_LOADED;
  }

  async load(): Promise<{ code: string, map?: RawSourceMap}> {
    const { fpath, app } = this;
    // fake entries will provide code directly
    const source = this.code || await fs.readFile(fpath, 'utf8');
    let code = await this.browserify(fpath, source);
    if (app.resolve.import) {
      for (const options of app.resolve.import) {
        code = namedImport.replaceAll(code, options);
      }
    }
    return { code };
  }

  async transpile(options: TranspileOptions) {
    const { app } = this;
    let result;

    try {
      result = app.swc !== true ? await this._transpile(options) : await this._transform(options);
    } catch (err) {
      debug('unable to transpile %s', this.fpath);
      throw err;
    }

    return result;
  }

  /**
   * Find deps of code and compare them with existing `this.deps` to see if there's
   * new dep to parse. Only the modules of the root packet are checked.
   */
  async checkImports({ code, intermediate = false }: SourceOptions & { intermediate: boolean }) {
    const { imports = [], dynamicImports = [] } = this;
    this.matchImport(code);

    // when checking imports introduced by intermediate code, dynamic imports need reset
    if (intermediate) {
      this.dynamicImports = dynamicImports;
      // import(specifier) -> Promise.resolve(require(specifier))
      for (let i = this.imports!.length; i >= 0; i--) {
        const specifier = this.imports![i];
        if (dynamicImports.includes(specifier)) this.imports!.splice(i, 1);
      }
      // babel plugin currently removes css imports, which interferes with dependency parsing at css module
      for (const dep of imports) {
        if (!this.imports!.includes(dep) && /\.(?:css|less|sass|scss)$/.test(dep)) {
          // import './baz.less';
          this.imports!.push(dep);
        }
      }
    }

    // when reloading module, parse new imports incrementally
    for (const dep of this.imports!) {
      if (!imports.includes(dep)) await this.parseImport(dep);
    }

    // when reloading module, new dynamic imports might be added
    for (const dep of this.dynamicImports!) {
      if (!dynamicImports.includes(dep)) {
        const child = await this.parseImport(dep);
        if (child) this.dynamicChildren.push(child);
      }
    }
  }

  async minify() {
    if (this.cache && this.cache.minified) return this.cache;

    const { code, map } = await this.load();
    if (!this.imports) this.matchImport(code);
    this.setCache(code, {
      ...(this.app.swc !== true ? await this._minify({ code, map }) : await this._transform({ code, map, minify: true })),
      minified: true
    });

    return this.cache!;
  }

  async _minify({ code, map }: TranspileOptions) {
    return this.uglify(await this.transpile({ code, map }))
  }

  _declare(code: string): string {
    const { id, imports } = this;
    return [
      `porter.define(${JSON.stringify(id)}, ${JSON.stringify(imports)}, function(require, exports, module) {${code}`,
      '})',
    ].join('\n');
  }

  async _transform({ code, map, minify }: TranspileOptions) {
    const { fpath, packet, app } = this;

    if (!(packet.transpiler && fpath.startsWith(packet.dir)) && !minify) {
      return { code: this._declare(code), map };
    }

    if (!plugins) plugins = loadPlugins();
    let { keep_fnames: keep_classnames = false } = app.uglifyOptions || {};
    if (keep_classnames instanceof RegExp) keep_classnames = keep_classnames.test(fpath);
    const filenameRelative = path.relative(app.root, fpath);
    const { jsc = {} } = packet.transpiler === 'swc' ? packet.transpilerOpts : {};
    const result = await transform(code, {
      swcrc: false,
      sourceMaps: true,
      inputSourceMap: JSON.stringify(map),
      filename: fpath,
      sourceFileName: `porter:///${filenameRelative}`,
      cwd: app.root,
      env: {
        targets: app.browserslistrc,
      },
      jsc: {
        ...jsc,
        parser: {
          ...jsc.parser,
          syntax: /\.tsx?$/i.test(fpath) ? 'typescript' : 'ecmascript',
          jsx: true,
          tsx: true,
        },
        experimental: {
          plugins: [
            ...plugins,
          ],
        },
        minify: minify ? (jsc.minify || {
          compress: {
            dead_code: true,
            global_defs: {
              process: {
                browser: true,
                env: {
                  BROWSER: true,
                  NODE_ENV: 'production',
                },
              },
            },
            keep_classnames,
          },
          mangle: {
            keep_classnames,
          },
        }) : {},
      },
      module: {
        type: 'commonjs',
      },
      minify,
    });
    await this.checkImports({ code: result.code, intermediate: true });

    return { ...result,
      // TODO customize module type
      code: `porter.define(${JSON.stringify(this.id)},${JSON.stringify(this.imports)},function(require,exports,module){${result.code}});`,
      map: result.map && JSON.parse(result.map),
    };
  }

  async _transpile({ code, map }: TranspileOptions) {
    const { fpath, packet, app } = this;
    const babel = packet.transpiler === 'babel' && packet.tryRequire('@babel/core');
    if (!babel) return { code: this._declare(code), map };

    /**
     * `babel.transform` finds presets and plugins relative to `fpath`. If `fpath`
     * doesn't start with packet.dir, it's quite possible that the needed presets or
     * plugins might not be found.
     */
    if (!fpath.startsWith(packet.dir)) return { code: this._declare(code), map };

    const filenameRelative = path.relative(app.root, fpath);
    const transpilerOptions = {
      ...packet.transpilerOpts,
      sourceMaps: true,
      inputSourceMap: map,
      ast: false,
      filename: fpath,
      filenameRelative,
      sourceFileName: `porter:///${filenameRelative}`,
      cwd: app.root,
    };
    const result = await babel.transform(code, transpilerOptions);
    await this.checkImports({ code: result.code, intermediate: true });

    return {...result, code: this._declare(result.code)}
  }

  getMinifyOptions() {
    const { fpath, app } = this;
    const source = `porter:///${path.relative(app.root, fpath)}`;
    const { uglifyOptions = {} } = app;
    const { keep_fnames } = uglifyOptions;

    return merge({}, uglifyOptions, {
      compress: {
        dead_code: true,
        global_defs: {
          process: {
            env: {
              BROWSER: true,
              NODE_ENV: process.env.NODE_ENV,
            },
          },
        },
      },
      keep_fnames: keep_fnames instanceof RegExp ? keep_fnames.test(source) : keep_fnames,
    });
  }

  uglify({ code, map }: SourceOptions) {
    const { fpath, app } = this;
    const source = `porter:///${path.relative(app.root, fpath)}`;
    const result = UglifyJS.minify({ [source]: code }, {
      ...this.getMinifyOptions(),
      output: { ascii_only: true },
      sourceMap: { content: map as any },
    });

    if (result.error) {
      // @ts-ignore
      throw new Error(`failed to minify: ${path.relative(app.root, fpath)}`, {
        cause: result.error,
      });
    }
    return result;
  }
};
