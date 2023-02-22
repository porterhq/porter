import { Argument, CallExpression, ConditionalExpression, ExportAllDeclaration, ExportNamedDeclaration, Expression, Identifier, IfStatement, ImportDeclaration, ModuleDeclaration, Program, Statement, TsInstantiation, TsType, TsTypeAnnotation } from '@swc/core';
import Visitor from '@swc/core/Visitor';

interface ImportName { export: string, local: string }

interface Import {
  source: string;
  names?: ImportName[];
  pattern?: string;
}

interface DynamicImport {
  source: string;
  pattern?: string;
}

interface GlobImport {
  pattern: string;
  eager: boolean;
}

const equalOperators = ['==', '===', '!=', '!=='];

function evalTest(expr: Expression) {
  if (expr.type === 'BooleanLiteral') return expr.value;
  if (expr.type === 'BinaryExpression' && equalOperators.includes(expr.operator)) {
    if ((expr.left.type === 'StringLiteral' && expr.right.type === 'StringLiteral') ||
        (expr.left.type === 'BooleanLiteral' && expr.right.type === 'BooleanLiteral')) {
      const result = expr.left.value === expr.right.value;
      return expr.operator.startsWith('!') ? !result : result;
    }
  }
}

function globImport(args: Argument[]) {
  if (args.length < 1) return;
  const [{ expression: pattern }] = args;
  if (pattern?.type !== 'StringLiteral') return;
  const options = args.length > 1 && args[1].expression;
  let eager = false;
  if (options && options.type === 'ObjectExpression') {
    for (const prop of options.properties) {
      if (prop.type !== 'KeyValueProperty') continue;
      if (prop.key.type !== 'Identifier' && prop.key.type !== 'StringLiteral') continue;
      if (prop.key.value === 'eager' && prop.value.type === 'BooleanLiteral') {
        eager = prop.value.value;
      }
    }
  }
  return { pattern: pattern.value, eager };
}

export default class ImportVisitor extends Visitor {
  imports: Import[] = [];
  dynamicImports: DynamicImport[] = [];
  globImports: GlobImport[] = [];
  typeImports: string[] = [];
  __esModule = false;

  visitImportDeclaration(node: ImportDeclaration): ImportDeclaration {
    this.__esModule = true;
    if (node.source.value.endsWith('.d.ts') || node.typeOnly) return node;

    this.imports.push({
      source: node.source.value,
      names: node.specifiers.reduce((result: ImportName[], decl) => {
        const local = decl.local.value;
        switch (decl.type) {
          case 'ImportDefaultSpecifier':
            result.push({ export: 'default', local });
            break;
          case 'ImportSpecifier':
            if (!decl.isTypeOnly) result.push({ export: decl.imported ? decl.imported.value : local, local });
            break;
          case 'ImportNamespaceSpecifier':
            result.push({ export: '*', local });
            break;
        }
        return result;
      }, []),
    });

    return node;
  }

  visitExportAllDeclaration(n: ExportAllDeclaration): ModuleDeclaration {
    this.__esModule = true;
    if (!n.source.value.endsWith('.d.ts')) {
      this.imports.push({ source: n.source.value, names: [] });
    }
    return n;
  }

  visitExportNamedDeclaration(n: ExportNamedDeclaration): ModuleDeclaration {
    this.__esModule = true;
    if (n.source && !n.source.value.endsWith('.d.ts')) {
      this.imports.push({
        source: n.source.value,
        names: n.specifiers.reduce((result: ImportName[], decl) => {
          if (decl.type === 'ExportSpecifier' && !decl.isTypeOnly) {
            result.push({
              export: decl.orig.value,
              local: decl.exported?.value || decl.orig.value,
            });
          }
          return result;
        }, []),
      });
    }
    return n;
  }

  visitCallExpression(node: CallExpression): Expression {
    const expr = node.arguments[0]?.expression;

    if (!expr || expr.type !== 'StringLiteral') {
      return super.visitCallExpression(node);;
    }

    if (node.callee.type == 'Import') {
      this.__esModule = true;
      // import('./foo);
      this.dynamicImports.push({ source: expr.value });
      return node;
    }

    if (node.callee.type === 'Identifier' && node.callee.value === 'require') {
      // require('./foo');
      this.imports.push({ source: expr.value });
      return node;
    }

    if (node.callee.type === 'MemberExpression') {
      const { object, property } = node.callee;
      // require.async('./foo');
      if (object.type === 'Identifier' && object.value === 'require' && property.type === 'Identifier' && property.value === 'async') {
        this.dynamicImports.push({ source: expr.value });
        return node;
      }
      // import.meta.glob('./data/*.json')
      if (object.type === 'MetaProperty' && property.type === 'Identifier' && property.value === 'glob') {
        const result = globImport(node.arguments);
        if (!result) return node;
        const { pattern, eager } = result;
        if (eager) {
          this.imports.push({ source: pattern, pattern });
        } else {
          this.dynamicImports.push({ source: pattern, pattern });
        }
      }
    }

    return super.visitCallExpression(node);
  }

  visitIfStatement(stmt: IfStatement): Statement {
    const result = evalTest(stmt.test);
    if (result === true) {
      this.visitStatement(stmt.consequent);
    } else if (result === false && stmt.alternate) {
      this.visitStatement(stmt.alternate);
    } else {
      super.visitIfStatement(stmt);
    }
    return stmt;
  }

  visitConditionalExpression(n: ConditionalExpression): Expression {
    const result = evalTest(n.test);

    if (result === true) {
      this.visitExpression(n.consequent);
    } else if (result === false && n.alternate) {
      this.visitExpression(n.alternate);
    } else {
      super.visitConditionalExpression(n);
    }

    return n;
  }

  visitTsTypeAnnotation(a: TsTypeAnnotation | undefined): TsTypeAnnotation | undefined {
    if (!a) return a;
    const ta = a.typeAnnotation;
    if (ta.type === 'TsTypeReference' && ta.typeName.type === 'Identifier') {
      this.typeImports.push(ta.typeName.value);
    }
    return a;
  }

  visitTsType(n: TsType): TsType {
    return n;
  }

  visitBindingIdentifier(n: Identifier & { typeAnnotation: TsTypeAnnotation }): Identifier {
    if (n.typeAnnotation) this.visitTsTypeAnnotation(n.typeAnnotation);
    return n;
  }

  visitProgram(n: Program): Program {
    this.imports = [];
    this.dynamicImports = [];
    super.visitProgram(n);

    const { imports, typeImports } = this;

    for (let i = imports.length - 1; i >= 0; i--) {
      const entry = imports[i];
      const { names = [] } = entry;
      if (names.length === 0) continue;
      entry.names = entry.names?.filter(({ local }) => !typeImports.includes(local));
      if (entry.names?.length === 0 && names.length > 0) imports.splice(i, 1);
    }

    return n;
  }
}

