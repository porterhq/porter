
import path from 'path';
import CssModule from './css_module';
import getFileManager from './less_file_manager';
import { TranspileOptions } from './module';
import Packet from './packet';

function getLessPlugin(packet: Packet) {
  return {
    install: function(less: any, pluginManager: any) {
      const BowerFileManager = getFileManager(less, packet);
      pluginManager.addFileManager(new BowerFileManager());
    },
    minVersion: [ 4, 0, 0 ],
  };
};

interface LessOutput { css: string, map: string }

export default class LessModule extends CssModule {
  matchImport(code: string) {
    // leave imports to less compiler
    this.imports = [];
  }

  async transpile({ code, map, minify }: TranspileOptions) {
    const { app, packet, fpath } = this;
    const less = app.packet.tryRequire('less');

    if (!less) {
      console.warn(new Error('less compiler not found'));
      return { code, map };
    }

    if (!packet.lessPlugin) {
      Object.defineProperty(packet, 'lessPlugin', {
        value: getLessPlugin(packet),
        configurable: true,
        enumerable: false,
      });
    }

    const paths = packet.paths || [ packet.dir ];
    const result = await new Promise<LessOutput>(function(resolve, reject) {
      less.render(code, {
        plugins: [ packet.lessPlugin ],
        paths,
        filename: fpath,
        sourceMap: {},
        ...app.lessOptions,
      }, function onRender(err: Error, output: LessOutput) {
        if (err) reject(err);
        else resolve(output);
      });
    });

    map = typeof result.map === 'string' && JSON.parse(result.map);
    if (map) {
      map.sources = map.sources.map(source => {
        return `porter:///${path.relative(app.root, source)}`;
      });
    }
    return super.transpile({ code: result.css, map, minify });
  }
};
