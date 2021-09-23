'use strict'

const expect = require('expect.js')
const path = require('path')

const Porter = require('..')

const root = path.resolve(__dirname, '../../demo-app')
const porter = new Porter({
  root,
  paths: ['components', 'browser_modules'],
  entries: ['home.js', 'test/suite.js']
})

describe('Module', function() {
  beforeEach(async function() {
    await porter.ready
  })

  it('should be iteratable with module.family', async function() {
    const pkg = porter.package.find({ name: 'lodash' })

    for (const entry of Object.values(pkg.entries)) {
      const files = {}
      // family members (descendents) should only be iterated once.
      for (const mod of entry.family) {
        if (files[mod.file]) throw new Error(`duplicated ${mod.file} (${entry.file})`)
        files[mod.file] = true
      }
    }
  })

  it('should generate compact lock', function() {
    expect('react-color' in porter.package.lock).to.be.ok()
    expect('react-color' in porter.package.entries['home.js'].lock).to.not.be.ok()
  })

  it('should eliminate heredoc when minify', async function() {
    const mod = porter.package.files['home.js']
    await mod.minify()
    const { code } = mod.cache
    expect(code).to.not.contain('heredoc')
  })

  it('should invalidate dev cache when minify', async function() {
    const mod = porter.package.files['home.js']

    // create dev cache
    mod.cache = null
    await mod.obtain()
    const devCache = mod.cache

    await mod.minify()
    expect(mod.cache.minified).to.be.ok()
    expect(devCache.code).to.not.eql(mod.cache.code)
  })
})
