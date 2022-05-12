'use strict';

const path = require('path');
const CssModule = require('./css_module');
const getFileManager = require('./less_file_manager');

function getLessPlugin(packet) {
  return {
    install: function(less, pluginManager) {
      const BowerFileManager = getFileManager(less, packet);
      pluginManager.addFileManager(new BowerFileManager());
    },
    minVersion: [ 4, 0, 0 ],
  };
};

module.exports = class LessModule extends CssModule {
  matchImport(code) {
    // leave imports to less compiler
    this.imports = [];
  }

  // async parseImport(dep) {
  //   if (dep.startsWith('~')) return await super.parseImport(dep.slice(1));

  //   const mod = await this.parseRelative(dep);
  //   if (mod) return mod;

  //   return await super.parseImport(dep);
  // }

  async transpile({ code, map }) {
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
    const result = await new Promise(function(resolve, reject) {
      less.render(code, {
        plugins: [ packet.lessPlugin ],
        paths,
        filename: fpath,
        sourceMap: {},
        ...app.lessOptions,
      }, function onRender(err, output) {
        if (err) reject(err);
        else resolve(output);
      });
    });

    if (typeof result.map === 'string') result.map = JSON.parse(result.map);
    const { sources } = result.map;
    result.map.sources = sources.map(source => {
      return `porter:///${path.relative(app.root, source)}`;
    });
    return { code: result.css, map: result.map };
  }
};
