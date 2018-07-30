'use strict'

const expect = require('expect.js')
const path = require('path')
const { readFile } = require('mz/fs')
const matchRequire = require('../lib/matchRequire')

const root = path.join(__dirname, '../../porter-app')

describe('matchRequire', function() {
  it('match require call statement', async function () {
    const code = await readFile(path.join(root, 'components/home.js'), 'utf8')
    const deps = matchRequire.findAll(code)

    expect(deps).to.contain('yen')
    // do not look into strings or comments
    expect(deps).to.not.contain('cropper/dist/cropper.css')
  })

  it('match import declaration', function () {
    const deps = matchRequire.findAll(`
      import * as yen from 'yen'
      import traverse from 'babel-traverse'
      import { existsSync as exists } from 'fs'

      const code = \`
        require('cropper')
        import $ from 'jquery'
      \`

      const css = '@import "cropper/dist/cropper.css"'

      export { resolve } from 'path'
    `)
    expect(deps).to.eql(['yen', 'babel-traverse', 'fs', 'path'])
  })

  it('match conditional require call statements', async function() {
    const deps = matchRequire.findAll(`
      if ("development" == "development") {
        require("jquery")
      } else {
        require('yen')
      }
    `)
    expect(deps).to.eql(['jquery'])
  })

  it('match conditional require in react-dom', async function() {
    const deps = matchRequire.findAll(`
      function checkDCE() {
        if ("production" !== 'production') {
          // This branch is unreachable because this function is only called
          // in production, but the condition is true only in development.
          // Therefore if the branch is still here, dead code elimination wasn't
          // properly applied.
          // Don't change the message. React DevTools relies on it. Also make sure
          // this message doesn't occur elsewhere in this function, or it will cause
          // a false positive.
          throw new Error('^_^');
        }
      }
      if ("production" === 'production') {
        // DCE check should happen before ReactDOM bundle executes so that
        // DevTools can report bad minification during injection.
        checkDCE();
        module.exports = require('./cjs/react-dom.production.min.js');
      } else {
        module.exports = require('./cjs/react-dom.development.js');
      }
    `)
    expect(deps).to.eql(['./cjs/react-dom.production.min.js'])
  })

  it('match else branch in conditional require if condition yields false', async function() {
    const deps = matchRequire.findAll(`
      if ('development' === 'production') {
        require('jquery')
      } else {
        require('yen')
      }
    `)
    expect(deps).to.eql(['yen'])
  })

  it('should not hang while parsing following code', async function() {
    const deps = matchRequire.findAll(`
      if ('production' !== 'production') {
        Object.freeze(emptyObject);
      }
    `)
    expect(deps).to.eql([])
  })

  it('should match boolean condition', async function() {
    const deps = matchRequire.findAll(`
      if (true) {
        require('jquery')
      } else {
        require('yen')
      }
    `)
    expect(deps).to.eql(['jquery'])
  })

  it('should match else branch of the boolean condition if the condition is false', async function() {
    const deps = matchRequire.findAll(`
      if (false) {
        require('jquery')
      } else {
        require('yen')
      }
    `)
    expect(deps).to.eql(['yen'])
  })

  it('should match detailed boolean condition', async function() {
    const deps = matchRequire.findAll(`
      if (true == true) {
        require('jquery')
      } else {
        require('yen')
      }
    `)
    expect(deps).to.eql(['jquery'])
  })

  it('shoud match both if condition is not always true or false', async function() {
    const deps = matchRequire.findAll(`
      if (a) {
        require('jquery')
      } else {
        require('yen')
      }
    `)
    expect(deps).to.eql(['jquery', 'yen'])
  })

  it('should not match module.require()', async function() {
    const deps = matchRequire.findAll(`
      var types = freeModule && freeModule.require && freeModule.require('util').types;
    `)
    expect(deps).to.eql([])
  })

  it('should skip multiple statements if negative', async function() {
    const deps = matchRequire.findAll(`
      var $
      var Canvas = window.Canvas

      if (true) {
        $ = require('jquery')
      } else {
        $ = require('cheerio)
        Canvas = require('canvas')
      }
    `)
    expect(deps).to.eql(['jquery'])
  })

  it('should match multiple statements if positive', async function() {
    const deps = matchRequire.findAll(`
      var $
      var Canvas = window.Canvas

      if (false) {
        $ = require('jquery')
      } else {
        $ = require('cheerio')
        Canvas = require('canvas')
      }
    `)
    expect(deps).to.eql(['cheerio', 'canvas'])
  })

  it('should match one liners with asi', async function() {
    const deps = matchRequire.findAll(`
      if (true) ColorExtactor = require('color-extractor/lib/color-extractor-canvas')
      else ColorExtactor = require('color-extractor/lib/color-extractor-im')
    `)
    expect(deps).to.eql(['color-extractor/lib/color-extractor-canvas'])
  })

  it('should match one liners with semicolon', async function() {
    const deps = matchRequire.findAll(`
      if (true) ColorExtactor = require('color-extractor/lib/color-extractor-canvas');else ColorExtactor = require('color-extractor/lib/color-extractor-im');
    `)
    expect(deps).to.eql(['color-extractor/lib/color-extractor-canvas'])
  })

  it ('should match one liners with ternary operator', async function() {
    const deps = matchRequire.findAll(`
      const foo = (true ? require('./foo') : require('./bar')) || 'foo'
    `)
    expect(deps).to.eql(['./foo'])
  })

  it('should match negative ternary one liner', async function() {
    const deps = matchRequire.findAll(`
      const foo = false ? require('./foo') : require('./bar')
    `)
    expect(deps).to.eql(['./bar'])
  })
})
