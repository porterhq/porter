'use strict'

const { readFile } = require('mz/fs')

const Module = require('./module')

module.exports = class JsonModule extends Module {
  async parse() {
    // nothing to parse here, just pure json data
  }

  matchImport() {
    return []
  }

  async load() {
    const { fpath } = this
    const code = await readFile(fpath, 'utf8')
    return { code }
  }

  async transpile() {
    const { id } = this
    const { code } = await this.load()

    return {
      code: `define(${JSON.stringify(id)}, ${code.trim()})`,
    }
  }

  async minify() {
    return this.transpile()
  }
}
