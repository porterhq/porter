import path from 'path';
import JsModule from './js_module';
import { TranspileOptions } from './module';

// tsc compiler options
interface CompilerOptions {
  [key: string]: any;
}

export default class TsModule extends JsModule {
  async _transpile({ code }: TranspileOptions, compilerOptions?: CompilerOptions) {
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
