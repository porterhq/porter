'use strict';

const path = require('path');
const JsModule = require('./js_module');

module.exports = class TsModule extends JsModule {
  _transpile({ code, }) {
    const { fpath, package: pkg } = this;
    const ts = pkg.tryRequire('typescript');

    if (!ts) return { code };

    const tsconfig = pkg.transpiler === 'typescript'
      ? pkg.transpilerOpts
      : require(path.join(pkg.dir, 'tsconfig.json'));

    const { compilerOptions } = tsconfig;
    const { outputText, diagnostics, sourceMapText } = ts.transpileModule(code, {
      compilerOptions: {
        ...compilerOptions,
        module: ts.ModuleKind.CommonJS,
        sourceMap: true,
      }
    });
    let map;

    if (sourceMapText) {
      const source = path.relative(pkg.app.root, fpath);
      map = JSON.parse(sourceMapText);
      map.sources = [ source ];
      map.file = source;
      map.sourceRoot = '/';
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
