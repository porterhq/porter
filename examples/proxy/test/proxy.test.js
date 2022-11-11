'use strict';

const expect = require('expect.js');
const request = require('supertest');
let proxyApp;

function requestPath(urlPath, status = 200, listener = proxyApp.callback()) {
  return new Promise(function(resolve, reject) {
    request(listener)
      .get(urlPath)
      .expect(status)
      .end(function(err, res) {
        if (err) reject(err);
        else resolve(res);
      });
  });
}

describe('examples/proxy/test/proxy.test.js', function() {
  before(async function() {
    const factory = require('../proxy-app');
    proxyApp = await factory();
  });

  it('should intercept local modules', async function() {
    const res = await requestPath('/shelter.js?main');
    expect(res.text).to.contain('define("shelter.js"');
    // the original app is delegated as remote resource and shall not be bundled here
    expect(res.text).to.not.contain('define("i18n/zh.js"');
  });
});
