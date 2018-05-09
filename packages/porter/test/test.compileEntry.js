'use strict'

const path = require('path')
const expect = require('expect.js')
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({ root })

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

// The way HTML creations were compiled.
describe('.compileEntry(entry, { map, preload })', function() {
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

  it('can override loaderConfig', async function() {
    // If not overridden, loaderConfig shall contain cache settings like 
    // 
    //     cache:{except:["@cara/porter-app"]}
    //
    expect(code).to.not.contain(',cache:{except')
  })
})
