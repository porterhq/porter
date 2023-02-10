import { PluginCreator } from 'postcss';

interface ImportOptions {}

const ImportCreator: PluginCreator<ImportOptions> = (opts = {}) => {
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

ImportCreator.postcss = true;

export default ImportCreator;
