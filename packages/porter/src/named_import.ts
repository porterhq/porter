import path from 'path';
// @ts-ignore
import jsTokens from 'js-tokens';

type ComponentCase = 'camel' | 'kebab' | 'snake';

export interface ImportOption {
  libraryName?: string;
  libraryDirectory?: string;
  camel2DashComponentName?: boolean;
  componentCase?: ComponentCase;
  style?: boolean | string;
  cjs?: boolean;
}

interface Declaration {
  name: string;
  alias?: string;
}

function getImports(names: string) {
  const tokens = names.match(jsTokens)!;
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

function formatImport({ name, specifier, cjs = false }: { name?: string, specifier: string, cjs?: boolean }) {
  if (typeof name === 'string') {
    return cjs
      ? `const ${name} = require(${JSON.stringify(specifier)}).default;`
      : `import ${name} from ${JSON.stringify(specifier)};`;
  }
  return cjs
    ? `require(${JSON.stringify(specifier)});`
    : `import ${JSON.stringify(specifier)};`;
}

function formatImports(declarations: Declaration[], options: ImportOption = {}) {
  if (options.camel2DashComponentName === false && options.componentCase == null) {
    options.componentCase = 'camel';
  }

  const {
    libraryName,
    libraryDirectory = 'lib',
    style = true,
    componentCase = 'kebab',
    cjs = false,
  } = options;
  const scripts = [];
  const styles = [];

  for (const declaration of declarations) {
    const { name, alias } = declaration;
    const chunk = [libraryName];
    if (libraryDirectory) chunk.push(libraryDirectory);
    const transformedChunkName = decamelize(name, componentCase);
    chunk.push(transformedChunkName);
    scripts.push(formatImport({ name: alias || name, specifier: chunk.join('/'), cjs }));
    if (style) {
      const file = typeof style === 'string' ? path.join('style', style) : 'style';
      styles.push(formatImport({ specifier: chunk.concat(file).join('/'), cjs }));
    }
  }

  return scripts.concat(styles).join('');
}

function formatRequires(declarations: Declaration[], options = {}) {
  return formatImports(declarations, { ...options, cjs: true });
}

function decamelize(_str: string, componentCase: ComponentCase) {
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

function getRequires(names: string) {
  const tokens = names.match(jsTokens)!;
  const requires = [];
  const rSpace = /\s/;
  let i = 0;
  let token = tokens[i];

  function next() {
    token = tokens[++i];
  }

  function space() {
    while (rSpace.test(token)) next();
  }

  function getRequire() {
    const name = token;
    next();
    let alias;
    space();
    if (token === ',') next();
    return { name, alias };
  }

  space();

  while (i < tokens.length) {
    space();
    requires.push(getRequire());
    if (token === ',') next();
    space();
  }

  return requires;
}

export function replaceAll(content: string, options: { libraryName?: string} = {}) {
  const { libraryName = 'antd' } = options;
  const pattern = new RegExp(`import\\s*\\{([^{}]+?)\\}\\s*from\\s*(['"])${libraryName}\\2;?`, 'g');
  const cjsPattern = new RegExp(`const\\s*\\{([^{}]+?)\\}\\s*=\\s*require\\((['"])${libraryName}\\2\\);`, 'g');

  return content.replace(pattern, function replace(m, names) {
    const imports = getImports(names);
    return formatImports(imports, options) + '\n'.repeat(m.split('\n').length - 1);;
  }).replace(cjsPattern, function replace(m, names) {
    const requries = getRequires(names);
    return formatRequires(requries, options) + '\n'.repeat(m.split('\n').length - 1);
  });
};
