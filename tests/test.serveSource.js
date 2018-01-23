'use strict'

const request = require('supertest')

function requestPath(apath, status = 200, app = require('../examples/default/app')) {
  return new Promise(function(resolve, reject) {
    request(app.callback())
      .get(apath)
      .expect(status)
      .end(function(err, res) {
        if (err) reject(err)
        else resolve(res)
      })
  })
}

describe('opts.serveSource', function() {
  it('should serve loader.js', async function () {
    await requestPath('/loader.js')
  })

  it('should serve components source', async function () {
    await requestPath('/components/home.js')
  })

  it('should serve dependencies source', async function () {
    await requestPath('/node_modules/yen/index.js')
  })

  it('should not serve source by default', async function () {
    await requestPath('/components/home.js', 404, require('../examples/default/app.serveSource'))
  })
})
