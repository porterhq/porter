// @ts-ignore
import jsTokens from 'js-tokens';

const rEqualOp = /^===?$/;
const rNotEqualOp = /^!==?$/;
const rSpace = /^\s+$/;
const rString = /^(['"'])([^\1]+)\1$/;

export function decodeUnicodeLiteral(text: string) {
  if (typeof text !== 'string') return text;
  try {
    return text.replace(/(\\u[0-9a-f]{4})/ig, (m, literal) => {
      return String.fromCodePoint(parseInt(literal.slice(2), 16));
    });
  } catch (err) {
    console.error(err);
  }
  return text;
};

/**
 * Finds all of the dependencies `require`d or `import`ed in the code passed in.
 */
export function findAll(content: string): { imports: string[], dynamicImports: string[], __esModule: boolean } {
  const parts = content.match(jsTokens)!;
  const imports: string[] = [];
  const dynamicImports: string[] = [];
  let i = 0;
  let part: string;

  function next() {
    part = parts[i++];
  }

  function space() {
    do {
      next();
    } while (rSpace.test(part));
  }

  function findRequire() {
    // to rule out module.require()
    if (parts[i - 2] == '.') return;

    space();
    if (part == '(') {
      space();
      const m = part.match(rString);
      space();
      // @ts-ignore
      if (m && part == ')') {
        imports.push(m[2]);
      }
    } else if (part === '.' && parts[i] === 'async' && parts[i + 1] === '(') {
      i += 2;
      next();
      const m = part.match(rString);
      if (m) dynamicImports.push(m[2]);
    }
  }

  function findDynamicImport() {
    next();
    const m = part.match(rString);
    if (m) dynamicImports.push(m[2]);
  }

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
  function findImport() {
    space();
    // import "foo"
    const m = part.match(rString);
    if (m) {
      imports.push(m[2]);
    } else if (part === '(') {
      findDynamicImport();
    } else {
      findImportFrom();
    }
  }

  function findImportFrom() {
    while (part && part != 'from') next();
    if (part == 'from') {
      space();
      const m = part.match(rString);
      if (m) imports.push(m[2]);
    }
  }

  function findExportFrom() {
    while (part && part != '\n' && part != 'from') next();
    if (part == 'from') {
      space();
      const m = part.match(rString);
      if (m) imports.push(m[2]);
    }
  }

  function findRequireInBlock() {
    if (part == '{') {
      // @ts-ignore
      while (part && part != '}') {
        // @ts-ignore
        if (part == 'require') findRequire();
        next();
      }
    } else {
      // when comes to spaces, `part` can be something like `"\n  "`.
      while (part && part != ';' && part[0] != '\n') {
        if (part == 'require') findRequire();
        next();
      }
    }
  }

  /**
   * A silly eval to determine whether the value of an expression is already determined (true/false) or undefined yet. It returns boolean if conditions were like following ones with the environment variables interpolated by loose-envify:
   *
   *     if (process.env.NODE_ENV == 'production')
   *     if (process.env.NODE_ENV != 'production')
   *     if (process.env.NODE_ENV == "production")
   *     if (process.env.BROWSER == true)
   *     if (process.env.BROWSER)
   *
   * @returns {(boolean|void)}
   * @example
   * sillyEval(['true'])
   * sillyEval(['false', '!=', 'true'])
   */
  function sillyEval(temp: string[]) {
    if (temp.length == 3 && (rEqualOp.test(temp[1]) || rNotEqualOp.test(temp[1]))) {
      if (rString.test(temp[0]) && rString.test(temp[2])) {
        return (temp[0].match(rString)![2] == temp[2].match(rString)![2]) == rEqualOp.test(temp[1]);
      }
      else if (temp[0] == 'true' || temp[0] == 'false') {
        return temp[0] == temp[2];
      }
    }
    else if (temp.length == 1 && (temp[0] == 'true' || temp[0] == 'false')) {
      return temp[0] == 'true';
    }
  }

  function skipBlock() {
    if (part == '{') {
      space();
      // @ts-ignore
      while (part != '}') next();
    } else {
      space();
      while (part && part != ';' && part[0] != '\n') next();
    }
  }

  function findConditionalRequire() {
    space();
    if (part != '(') return;

    space();
    const temp: string[] = [];
    // @ts-ignore
    while (part != ')') {
      if (!rSpace.test(part)) temp.push(part);
      next();
    }
    space();

    let result = sillyEval(temp);
    if (result === true) {
      findRequireInBlock();
      space();
      if (part == 'else') {
        space();
        skipBlock();
      }
    }
    else if (result === false) {
      skipBlock();
      space();
      if (part == 'else') {
        space();
        findRequireInBlock();
      }
    }
  }

  function findTernaryRequire() {
    let prev;
    for (let j = i - 2; j >= 0; j--) {
      prev = parts[j];
      if (!rSpace.test(prev)) break;
    }

    if (prev == 'true') {
      while (part && part != ':') {
        if (part == 'require') findRequire();
        next();
      }
      while (part && part != ';' && part != ')' && part[0] != '\n') next();
    }
    else if (prev == 'false') {
      while (part && part != ':') next();
      while (part && part != ';' && part != ')' && part[0] != '\n') {
        if (part == 'require') findRequire();
        next();
      }
    }
  }

  let __esModule = false;
  next();
  // @ts-ignore
  while (part) {
    if (part == 'if') {
      findConditionalRequire();
    }
    else if (part == '?') {
      findTernaryRequire();
    }
    else if (part == 'require') {
      findRequire();
    }
    else if (part == 'import') {
      findImport();
      __esModule = true;
    }
    else if (part == 'export') {
      const nextPart = parts[i + 1];
      if (nextPart === '{' || nextPart === '*') findExportFrom();
      __esModule = true;
    }
    next();
  }

  return {
    imports: imports.map(decodeUnicodeLiteral),
    dynamicImports: dynamicImports.map(decodeUnicodeLiteral),
    __esModule,
  };
};
