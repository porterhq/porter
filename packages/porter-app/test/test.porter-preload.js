'use strict'

const assert = require('assert').strict
const expect = require('expect.js')
const Koa = require('koa')
const path = require('path')
const request = require('supertest')

const porter = require('../lib/porter-preload')
const { exists, readFile, writeFile } = require('mz/fs')

const app = new Koa()
app.use(porter.async())

function requestPath(urlPath, status = 200, listener = app.callback()) {
  return new Promise(function(resolve, reject) {
    request(listener)
      .get(urlPath)
      .expect(status)
      .end(function(err, res) {
        if (err) reject(err)
        else resolve(res)
      })
  })
}

describe('Porter_readFile()', function() {
  it('should bundle all dependencies unless preloaded', async function() {
    const { name, version } = porter.package
    const res = await requestPath(`/${name}/${version}/home.js?main`)
    assert.ok(res.text.includes(`define("${name}/${version}/home.js"`))

    // jquery is bundled
    const jquery = porter.package.find({ name: 'jquery' })
    assert.ok(res.text.includes(`define("jquery/${jquery.version}/${jquery.main}`))

    // react is required by `preload.js` already, hence it should not be bundled here.
    const react = porter.package.find({ name: 'react' })
    assert.ok(!res.text.includes(`define("react/${react.version}/${react.main}`))
  })

  it("should bundle preload's dependencies", async function() {
    const { name, version } = porter.package
    const res = await requestPath(`/${name}/${version}/preload.js`)
    assert.ok(res.text.includes(`define("${name}/${version}/preload.js`))

    // yen is bundled
    const yen = porter.package.find({ name: 'yen' })
    assert.ok(res.text.includes(`define("yen/${yen.version}/${yen.main}`))
  })

  it('should be mutually exclusive', async function() {
    const { name, version } = porter.package
    const { text: mainText } = await requestPath(`/${name}/${version}/home.js?main`)
    const mainIds = mainText.match(/define\("([^"]+)"/g)
    const { text: preloadText } = await requestPath(`/${name}/${version}/preload.js`)
    const preloadIds = preloadText.match(/define\("([^"]+)"/g)

    for (const id of mainIds) assert.ok(!preloadIds.includes(id))
  })

  it('should invalidate opts.preload if dependencies change', async function() {
    const { name, version, dir } = porter.package
    const fpath = path.join(dir, 'components/foo.js')
    const source = await readFile(fpath, 'utf8')

    const mark = `/* changed ${Date.now().toString(36)} */`
    await requestPath(`/${name}/${version}/preload.js?entry`)
    await writeFile(fpath, `${source}${mark}`)

    try {
      // https://stackoverflow.com/questions/10468504/why-fs-watchfile-called-twice-in-node
      if (process.platform !== 'darwin' && process.platform !== 'win32') {
        await porter.package.reload('change', 'i18n/zh.js')
      } else {
        // {@link Package#watch} takes time to reload
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      const cachePath = path.join(porter.cache.dest, name, version, 'preload.js')
      expect(await exists(cachePath)).to.not.be.ok()
      await requestPath(`/${name}/${version}/preload.js`)
      expect(await exists(cachePath)).to.be.ok()
      expect(await readFile(cachePath, 'utf8')).to.contain(mark)
    } finally {
      await writeFile(fpath, source)
    }
  })

  it('should not override lock in preload', async function() {
    const { name, version } = porter.package
    const res = await requestPath(`/${name}/${version}/preload.js?entry`)
    expect(res.text.includes('Object.assign(porter.lock')).to.not.be.ok()
  })
})
