import sass from 'sass';
import { pathToFileURL } from 'url';
import CssModule from './css_module';
import { TranspileOptions } from './module';

export default class SassModule extends CssModule {
  matchImport(code: string) {
    // leave imports to sass compiler
    this.imports = [];
  }

  async transpile({ code, map, minify }: TranspileOptions) {
    const { fpath, packet } = this;
    const loadPaths = packet.paths || [ packet.dir ];

    const result = await sass.compileStringAsync(code, {
      loadPaths,
      url: pathToFileURL(fpath),
      importers: [{
        findFileUrl: async (url) => {
          const mod = await this.parseImport(url);
          return mod ? pathToFileURL(mod.fpath) : null;
        },
      }],
    });

    // @ts-ignore
    return super.transpile({ code: result.css, map: result.sourceMap, minify });
  }
};
