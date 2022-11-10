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
    const { dynamicImports } = this;
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
    // import('./utils/math')
    for (let i = this.imports.length - 1; i >= 0; i--) {
      const specifier = this.imports[i];
      if (dynamicImports.includes(specifier) || (oldImports && !oldImports.includes(specifier))) {
        this.imports.splice(i, 1);
      }
    }
    this.dynamicImports = dynamicImports;

    return result;
  }

  async _transpile({ code }, compilerOptions) {
    const { app, fpath, packet } = this;

    // might transpile typescript with tools like babel or swc
    if (app.transpile.typescript !== 'tsc') {
      return super._transpile({ code });
    }

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
