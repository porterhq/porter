'use strict';

const path = require('path');
const JsModule = require('./js_module');

module.exports = class TsModule extends JsModule {
  async _transpile({ code, }) {
    const { fpath, packet } = this;
    const ts = packet.tryRequire('typescript');

    if (!ts) return { code };

    const fileName = path.relative(packet.app.root, fpath);
    const tsconfig = packet.transpiler === 'typescript'
      ? packet.transpilerOpts
      : require(path.join(packet.dir, 'tsconfig.json'));

    // - https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#a-simple-transform-function
    const { compilerOptions } = tsconfig;
    const { outputText, diagnostics, sourceMapText } = ts.transpileModule(code, {
      fileName,
      compilerOptions: {
        ...compilerOptions,
        module: ts.ModuleKind.CommonJS,
        sourceRoot: '/',
        sourceMap: true,
        // ts.transpileModule() needs source map not being inlined
        inlineSourceMap: false,
      },
    });
    let map;

    if (sourceMapText) {
      map = JSON.parse(sourceMapText);
      map.sources = [ fileName ];
      map.file = fileName;
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
