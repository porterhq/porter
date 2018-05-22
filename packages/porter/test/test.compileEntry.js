'use strict'

const path = require('path')
const expect = require('expect.js')
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({ root, preload: 'preload' })

describe('.compileEntry({ entry, code })', function () {
  it('can compile component with specified code', async function () {
    const { code } = await porter.compileEntry({
      entry: 'fake/entry.js',
      code: `
        'use strict'
        var $ = require('yen')
        $('body').addClass('hidden')
      `
    }, { all: true, writeFile: false })

    expect(code).to.contain('fake/entry.js')
    expect(code).to.contain('yen/1.2.4/index.js')
    expect(code).to.contain('yen/1.2.4/events.js')
    expect(code).to.not.contain('preload.js')
  })
})

describe('.compileEntry({ entry, deps, code })', function() {
  it('can compile component with specified deps and code', async function() {
    const { code } = await porter.compileEntry({
      entry: 'fake/entry.js',
      deps: ['yen', 'jquery'],
      code: `
        'use strict'
        var $ = require('yen')
        $('body').addClass('hidden')
      `
    }, { all: true, writeFile: false })

    const { name, version, main } = porter.package.find({ name: 'jquery' })
    expect(code).to.contain(`${name}/${version}/${main}`)
  })
})

describe('.compileEntry(entry, { loaderConfig })', function() {
  let code

  before(async function() {
    const result = await porter.compileEntry({
      entry: 'fake/entry.js',
      code: `
        'use strict'
        var $ = require('yen')
        $('body').removeClass('hidden')
      `
    }, {
      all: true,
      writeFile: false,
      loaderConfig: {
        cache: undefined
      }
    })

    code = result.code
  })

  /**
   * Normally the cache would be `cache:{except:["@cara/porter-app"]}`, should be
   * overridden by `{ loaderConfig }`
   */
  it('can override loaderConfig', async function() {
    expect(code).to.not.contain(',cache:{except')
  })

  it('should omit the global preload settings', async function() {
    expect(code).to.not.contain('preload.js')
  })
})
