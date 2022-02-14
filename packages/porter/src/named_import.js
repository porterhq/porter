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

function formatImports(declarations, options = {}) {
  if (options.camel2DashComponentName === false && options.componentCase == null) {
    options.componentCase = 'camel';
  }

  const {
    libraryName,
    libraryDirectory = 'lib',
    style = true,
    componentCase = 'kebab'
  } = options;
  const scripts = [];
  const styles = [];

  for (const declaration of declarations) {
    const { name, alias } = declaration;
    const chunk = [libraryName];
    if (libraryDirectory) chunk.push(libraryDirectory);
    const transformedChunkName = decamelize(name, componentCase);
    chunk.push(transformedChunkName);
    scripts.push(`import ${alias || name} from ${JSON.stringify(chunk.join('/'))};`);
    if (style) {
      const file = typeof style === 'string' ? path.join('style', style) : 'style';
      styles.push(`import ${JSON.stringify(chunk.concat(file).join('/'))};`);
    }
  }

  return scripts.concat(styles).join('');
}

function decamelize(_str, componentCase) {
  const str = _str[0].toLowerCase() + _str.substr(1);

  switch (componentCase) {
    case 'kebab':
      return str.replace(/([A-Z])/g, $1 => `-${$1.toLowerCase()}`);
    case 'snake':
      return str.replace(/([A-Z])/g, $1 => `_${$1.toLowerCase()}`);
    case 'camel':
      return str;
    default:
      return _str;
  }
}

exports.replaceAll = function replaceAll(content, options = {}) {
  const { libraryName = 'antd' } = options;
  const pattern = new RegExp(`import\\s*\\{([^{}]+?)\\}\\s*from\\s*(['"])${libraryName}\\2;?`, 'g');
  return content.replace(pattern, function replace(m, names) {
    const imports = getImports(names);
    return formatImports(imports, options) + '\n'.repeat(m.split('\n').length - 1);;
  });
};
