'use strict';

/**
 * @type {import('postcss').PluginCreator}
 */
 module.exports = (opts = {}) => {
  // Work with options here

  return {
    postcssPlugin: 'atImport',
    AtRule: {
      import(atRule) {
        atRule.remove();
      }
    }
  };
};

module.exports.postcss = true;
