import Debug from 'debug';
import path from 'path';
import UglifyJS from 'uglify-js';
import { readFile } from 'fs/promises';
import merge from 'lodash/merge';
import { parseSync} from '@swc/core';

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
    const { file, importVisitor } = this;
    const program = parseSync(code, {
      syntax: /\.tsx?/i.test(file) ? 'typescript' : 'ecmascript',
      tsx: file.endsWith('.tsx'),
      jsx: file.endsWith('.jsx'),
    });
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
      NODE_ENV: process.env.NODE_ENV || 'development',
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
      packet.transpiler = app.packet.transpiler;
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
    const source = this.code || await readFile(fpath, 'utf8');
    let code = await this.browserify(fpath, source);
    if (app.resolve.import) {
      for (const options of app.resolve.import) {
        code = namedImport.replaceAll(code, options);
      }
    }
    return { code };
  }

  async transpile(options: TranspileOptions) {
    let result;

    try {
      result = await this._transpile(options);
    } catch (err) {
      debug('unable to transpile %s', this.fpath);
      throw err;
    }

    // if fpath is ignored, @babel/core returns nothing
    if (result) {
      await this.checkImports({ code: result.code, intermediate: true });
    }

    const { id, imports } = this;
    return {
      ...result,
      code: [
        `porter.define(${JSON.stringify(id)}, ${JSON.stringify(imports)}, function(require, exports, module, __module) {${result.code}`,
        '})'
      ].join('\n'),
    };
  }

  /**
   * Find deps of code and compare them with existing `this.deps` to see if there's
   * new dep to parse. Only the modules of the root packet are checked.
   */
  async checkImports({ code, intermediate = false }: SourceOptions & { intermediate: boolean }) {
    const { imports = [], dynamicImports = [] } = this;
    this.matchImport(code);

    for (const dep of this.imports!) {
      if (!imports.includes(dep) && !dynamicImports.includes(dep)) {
        const child = await this.parseImport(dep);
        if (child && this.dynamicImports!.includes(dep)) this.dynamicChildren.push(child);
      }
    }

    for (const dep of imports) {
      if (!this.fake && !this.imports!.includes(dep)) {
        if (/\.(?:css|less|sass|scss)$/.test(dep)) {
          // import './baz.less';
          this.imports!.push(dep);
        }
      }
    }

    // when checking imports introduced by intermediate code, dynamic imports need reset
    // import(specifier) -> Promise.resolve(require(specifier))
    if (intermediate) {
      for (const specifier of dynamicImports) {
        if (!this.dynamicImports!.includes(specifier)) this.dynamicImports!.push(specifier);
      }
      for (let i = this.imports!.length; i >= 0; i--) {
        const specifier = this.imports![i];
        if (this.dynamicImports!.includes(specifier)) this.imports!.splice(i, 1);
      }
    }
  }

  async minify() {
    if (this.cache && this.cache.minified) return this.cache;

    const { code, map } = await this.load();
    if (!this.imports) this.matchImport(code);
    this.setCache(code, {
      ...this.uglify(await this.transpile({ code, map })),
      minified: true
    });

    return this.cache!;
  }

  async _transpile({ code, map }: TranspileOptions) {
    const { fpath, packet, app } = this;
    const babel = packet.transpiler === 'babel' && packet.tryRequire('@babel/core');
    if (!babel) return { code, map };

    /**
     * `babel.transform` finds presets and plugins relative to `fpath`. If `fpath`
     * doesn't start with packet.dir, it's quite possible that the needed presets or
     * plugins might not be found.
     */
    if (!fpath.startsWith(packet.dir)) return { code, map };

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
    return await babel.transform(code, transpilerOptions);
  }

  uglify({ code, map }: SourceOptions) {
    const { fpath, app } = this;
    const source = `porter:///${path.relative(app.root, fpath)}`;
    const { uglifyOptions = {} } = app;
    const { keep_fnames } = uglifyOptions;

    const result = UglifyJS.minify({ [source]: code }, merge({}, uglifyOptions, {
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
      output: { ascii_only: true },
      sourceMap: { content: map as any },
    }));

    if (result.error) {
      // @ts-ignore
      throw new Error(`failed to minify: ${path.relative(app.root, fpath)}`, {
        cause: result.error,
      });
    }
    return result;
  }
};