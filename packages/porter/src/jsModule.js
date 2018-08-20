'use strict'

const path = require('path')
const UglifyJS = require('uglify-js')
const { readFile } = require('mz/fs')

const Module = require('./module')
const deheredoc = require('../lib/deheredoc')
const envify = require('../lib/envify')
const matchRequire = require('../lib/matchRequire')


module.exports = class JsModule extends Module {
  matchImport(code) {
    return matchRequire.findAll(code)
  }

  async mightEnvify(fpath, code) {
    const { package: pkg } = this
    if (pkg.transform.some(name => name == 'envify' || name == 'loose-envify')) {
      return envify(fpath, code)
    } else {
      return code
    }
  }

  async load() {
    const { fpath } = this
    const code = this.code || await readFile(fpath, 'utf8')
    const envified = await this.mightEnvify(fpath, code)
    return { code: envified }
  }

  async transpile({ code, map }) {
    const { id, deps } = this
    const result = await this._transpile({ code, map })
    code = result.code

    return {
      code: [
        `define(${JSON.stringify(id)}, ${JSON.stringify(deps)}, function(require, exports, module) {${code}`,
        '})'
      ].join('\n'),
      map
    }
  }

  async minify() {
    if (this.minified) return this.minified
    const { code, map } = await this.load()
    const deps = this.deps || this.matchImport(code)
    for (let i = deps.length - 1; i >= 0; i--) {
      if (deps[i].endsWith('heredoc')) deps.splice(i, 1)
    }
    this.deps = deps
    this.minified = this.tryUglify(await this.transpile({ code, map }))
    return this.minified
  }

  transpileTypeScript({ code, }) {
    const { fpath, id, package: pkg } = this
    const ts = pkg.tryRequire('typescript')

    if (!ts) return { code }

    const { compilerOptions } = pkg.transpilerOpts
    const { outputText, diagnostics, sourceMapText } = ts.transpileModule(code, {
      compilerOptions: { ...compilerOptions, module: 'commonjs' }
    })
    const map = JSON.parse(sourceMapText)

    map.sources = [path.relative(pkg.app.root, fpath)]
    map.file = id
    map.sourceRoot = '/'

    if (diagnostics.length) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.file) {
          let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
          let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
          console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`)
        }
        else {
          console.log(`${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
        }
      }
    }

    return {
      code: outputText.replace(/\/\/# sourceMappingURL=.*$/, ''),
      map
    }
  }

  async transpileEcmaScript({ code, }) {
    const { fpath, package: pkg } = this
    const babel = pkg.tryRequire('babel-core')

    if (!babel) return { code }

    return await babel.transform(code, {
      ...pkg.transpilerOpts,
      sourceMaps: true,
      sourceRoot: '/',
      ast: false,
      filename: fpath,
      filenameRelative: path.relative(pkg.dir, fpath),
      sourceFileName: path.relative(pkg.dir, fpath)
    })
  }

  async _transpile({ code, map }) {
    const { fpath, package: pkg } = this

    /**
     * `babel.transform` finds presets and plugins relative to `fpath`. If `fpath`
     * doesn't start with pkg.dir, it's quite possible that the needed presets or
     * plugins might not be found.
     */
    if (!fpath.startsWith(pkg.dir)) return { code, map }

    switch (pkg.transpiler) {
    case 'babel':
      return this.transpileEcmaScript({ code, map })
    case 'typescript':
      return this.transpileTypeScript({ code, map })
    default:
      return { code, map }
    }
  }

  tryUglify({ code, map }) {
    try {
      return this.uglify({ code, map }, UglifyJS)
    } catch (err) {
      return this.uglify({ code, map }, require('uglify-es'))
    }
  }

  uglify({ code, map }, uglifyjs) {
    const { fpath } = this
    const source = path.relative(this.package.app.root, fpath)
    const parseResult = uglifyjs.minify({ [source]: code }, {
      parse: {},
      compress: false,
      mangle: false,
      output: { ast: true, code: false }
    })

    if (parseResult.error) {
      const err = parseResult.error
      throw new Error(`${err.message} (${err.filename}:${err.line}:${err.col})`)
    }

    const result = uglifyjs.minify(deheredoc(parseResult.ast), {
      compress: {
        dead_code: true,
        global_defs: {
          process: {
            env: {
              BROWSER: true,
              NODE_ENV: process.env.NODE_ENV
            }
          }
        }
      },
      output: { ascii_only: true },
      sourceMap: {
        content: map,
        root: '/'
      },
      ie8: true
    })

    if (result.error) {
      const err = result.error
      throw new Error(`${err.message} (${err.filename}:${err.line}:${err.col})`)
    }
    return result
  }
}
