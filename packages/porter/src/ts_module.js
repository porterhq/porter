'use strict';

const path = require('path');
// const fs = require('fs/promises');
const JsModule = require('./js_module');

module.exports = class TsModule extends JsModule {
  async load() {
    const { packet } = this;
    const { code } = await super.load();
    const { imports: oldImports } = this;

    this.matchImport(code);
    const { dynamicImports, imports } = this;
    const ts = packet.tryRequire('typescript');
    const compilerOptions = ts && {
      target: ts.ScriptTarget.ES2022,
      sourceMap: false,
    };
    // remove imports of type definitions in advance, such as
    // import { IModel } from './foo.d.ts';
    // import { IOptions } from './bar.ts';
    const result = await this._transpile({ code }, compilerOptions);
    this.matchImport(result.code);

    // remove imports that are transformed from dynamic imports, such as
    // import('./utils/math');
    for (let i = this.imports.length - 1; i >= 0; i--) {
      const specifier = this.imports[i];
      if (dynamicImports.includes(specifier) || (oldImports && !oldImports.includes(specifier))) {
        this.imports.splice(i, 1);
      }
    }
    // restore css imports that might be removed when compiling with babel, such as
    // import './foo.css';
    for (const specifier of imports) {
      if (specifier.endsWith('.css') && !this.imports.includes(specifier)) {
        this.imports.push(specifier);
      }
    }
    this.dynamicImports = dynamicImports;

    return { code };
  }

  async _transpile({ code }, compilerOptions) {
    const { app, fpath, packet } = this;

    // might transpile typescript with tools like babel or swc
    if (app.transpile.typescript !== 'tsc') {
      return super._transpile({ code });
    }

    /**
     * @type import('typescript')
     */
    const ts = packet.tryRequire('typescript');

    if (!ts) return { code };

    const fileName = path.relative(packet.app.root, fpath);
    const tsconfig = packet.transpiler === 'typescript'
      ? packet.transpilerOpts
      : require(path.join(packet.dir, 'tsconfig.json'));

    // - https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#a-simple-transform-function
    const { outputText, diagnostics, sourceMapText } = ts.transpileModule(code, {
      fileName,
      compilerOptions: {
        ...tsconfig.compilerOptions,
        module: ts.ModuleKind.CommonJS,
        sourceMap: true,
        // ts.transpileModule() needs source map not being inlined
        inlineSourceMap: false,
        ...compilerOptions,
      },
    });
    let map;

    if (sourceMapText) {
      map = JSON.parse(sourceMapText);
      // generated map.sources were fs.basename(fileName), which is not correct
      map.sources = [ `porter:///${fileName}` ];
    }

    if (diagnostics.length) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.file) {
          let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
          let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
          console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
        }
        else {
          console.log(`${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
        }
      }
    }

    return {
      code: outputText.replace(/\/\/# sourceMappingURL=.*$/, ''),
      map
    };
  }
};
