'use strict';

const path = require('path');
const jsTokens = require('js-tokens').default;

function getImports(names) {
  const tokens = names.match(jsTokens);
  const imports = [];
  const rSpace = /\s/;
  let i = 0;
  let token = tokens[i];

  function next() {
    token = tokens[++i];
  }

  function space() {
    while (rSpace.test(token)) next();
  }

  function getImport() {
    const name = token;
    next();
    let alias;
    space();
    if (token === 'as') {
      next();
      space();
      alias = token;
      next();
    }
    if (token === ',') next();
    return { name, alias };
  }

  space();

  while (i < tokens.length) {
    space();
    imports.push(getImport());
    if (token === ',') next();
    space();
  }

  return imports;
}

function formatImports(declarations, options) {
  const {
    libraryName,
    libraryDirectory = 'lib',
    style = true,
  } = options;
  const scripts = [];
  const styles = [];

  for (const declaration of declarations) {
    const { name, alias } = declaration;
    const chunk = [ libraryName ];
    if (libraryDirectory) chunk.push(libraryDirectory);
    chunk.push(dasherize(name));
    scripts.push(`import ${alias || name} from '${chunk.join('/')}';`);
    if (style) {
      const file = typeof style === 'string' ? path.join('style', style) : 'style';
      styles.push(`import '${chunk.join('/')}/${file}';`);
    }
  }

  return scripts.concat(styles).join('');
}

/**
 * Convert strings connected with hyphen or underscore into camel case. e.g.
 * @example
 * camelCase('FooBar')   // => 'fooBar'
 * camelCase('foo-bar')  // => 'fooBar'
 * camelCase('foo_bar')  // => 'fooBar'
 * @param {string} str
 * @returns {string}
 */
function dasherize(str) {
  return str
    .replace(/^([A-Z])/, (m, chr) => chr.toLowerCase())
    .replace(/([A-Z])/g, (m, chr) => `-${chr.toLowerCase()}`);
}

exports.replaceAll = function replaceAll(content, options = {}) {
  const { libraryName = 'antd' } = options;
  const pattern = new RegExp(`import\\s*\\{([^{}]+?)\\}\\s*from\\s*(['"])${libraryName}\\2;?`, 'g');
  return content.replace(pattern, function replace(m, names) {
    const imports = getImports(names);
    return formatImports(imports, options);
  });
};
