'use strict'

const path = require('path')
const Porter = require('..')

const root = path.join(__dirname, '../../porter-app')
const porter = new Porter({
  root,
  paths: ['components', 'browser_modules'],
  entries: ['home.js', 'test/suite.js']
})

describe('Module', function() {
  beforeEach(async function() {
    try {
      await porter.ready
    } catch (err) {
      console.error(err.stack)
    }
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
})
