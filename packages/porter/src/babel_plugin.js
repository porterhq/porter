'use strict';

const glob = require('glob');

// https://github.com/junosuarez/heredoc/blob/master/index.js
const stripPattern = /^[ \t]*(?=[^\s]+)/mg;

function strip(text = '') {
  const indentLen = text.match(stripPattern).reduce(function (min, line) {
    return Math.min(min, line.length);
  }, Infinity);

  const indent = new RegExp('^[ \\t]{' + indentLen + '}', 'mg');
  return indentLen > 0
    ? text.replace(indent, '')
    : text;
}

const cssExtensions = [ '.css', '.less', '.sass', '.scss' ];

/**
 * @param {Object} options
 * @param { import("@babel/types")} options.types
 * @param { import("@babel/template")} options.template
 * @returns {Object}
 */
module.exports = function({ types: t, template }) {
  let globIndex = 0;

  const visitor = {
    /**
     * Remove `require('heredoc')`
     * @param {import("@babel/core").NodePath} path
     * @param {import('@babel/core').PluginPass} state
     */
    VariableDeclaration(path) {
      const { node } = path;
      const { init } = node.declarations[0];
      const expr = t.isMemberExpression(init) ? init.object : init;
      if (t.isCallExpression(expr) && expr.callee.name === 'require' && expr.arguments[0].value === 'heredoc') {
        path.remove();
      }
    },

    /**
     * Transform `heredoc(function() {/* text ...})` to text.
     * @param {import("@babel/core").NodePath} path
     * @param {import('@babel/core').PluginPass} state
     */
    CallExpression(path) {
      const { node } = path;
      if (node.callee.name === 'heredoc' && node.arguments.length === 1) {
        const { body } = node.arguments[0];
        if (body.type === 'BlockStatement' && body.innerComments.length === 1) {
          path.replaceWithSourceString(JSON.stringify(strip(body.innerComments[0].value)));
        }
      }
    },

    /**
     * Transform `import.meta.url` to `__module.meta.url`
     * Transform `import.meta.glob(pattern, options)` like vite https://vitejs.dev/guide/features.html#glob-import
     * @param {import("@babel/core").NodePath} path
     * @param {import('@babel/core').PluginPass} state
     */
    MetaProperty(path, state) {
      if (t.isCallExpression(path.parentPath.parent) && path.parent.property.name === 'glob') {
        const node = path.parentPath.parent;
        if (node.arguments.length === 0) {
          throw new Error('import.meta.glob must have at least one argument');
        }
        const [pattern, options = {}] = node.arguments;
        if (!t.isStringLiteral(pattern)) {
          throw new Error('import.meta.glob first argument must be a string literal');
        }
        const opts = { cwd: require('path').dirname(state.filename) };
        for (const prop of options.properties || []) opts[prop.key.name] = prop.value.value;
        const files = glob.sync(pattern.value, opts);
        const callExpression = path.find(p => p.isCallExpression());
        if (opts.eager) {
          const properties = [];
          const buildImport = template('import * as %%local%% from %%source%%;', { sourceType: 'module' });
          const statement = callExpression.getAncestry().slice(-2)[0];
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const local = `__glob_${globIndex++}_${i}`;
            statement.insertBefore(buildImport({ local: t.identifier(local), source: t.stringLiteral(file) }));
            properties.push(t.objectProperty(t.stringLiteral(file), t.identifier(local)));
          }
          callExpression.replaceWith(t.objectExpression(properties));
        } else {
          const properties = [];
          const buildDynamicImport = template.expression('() => import(%%source%%)', { sourceType: 'module' });
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            properties.push(t.objectProperty(t.stringLiteral(file), buildDynamicImport({ source: t.stringLiteral(file) })));
          }
          callExpression.replaceWith(t.objectExpression(properties));
        }
      } else {
        path.replaceWith(t.memberExpression(t.identifier('__module'), t.identifier('meta')));
      }
    },

    ImportDeclaration(path) {
      const { node } = path;
      if (!cssExtensions.some(ext => node.source.value.endsWith(ext))) return;
      if (node.specifiers.length === 0) path.remove();
    },
  };

  return { visitor };
};
