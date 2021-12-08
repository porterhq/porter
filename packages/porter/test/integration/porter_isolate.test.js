'use strict';

const { strict: assert } = require('assert');
const expect = require('expect.js');
const Koa = require('koa');
const request = require('supertest');
const porter = require('../../../demo-app/lib/porter_isolate');

const app = new Koa();
app.use(porter.async());

function requestPath(urlPath, status = 200, listener = app.callback()) {
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

describe('Porter_readFile()', function() {
  after(async function() {
    await porter.destroy();
  });

  it('should isolate packet from entry bundle', async function() {
    const { text: mainText } = await requestPath('/home.js?main');
    // expect(mainText).to.contain('define') hangs if test fails
    assert.ok(mainText.includes('define("home.js"'));
    const react = porter.packet.find({ name: 'react' });
    assert.ok(!mainText.includes(`define("react/${react.version}/${react.main}"`));
  });

  it('should isolate packet from preload bundle', async function() {
    const { text: preloadText } = await requestPath('/preload.js');
    assert.ok(preloadText.includes('define("preload.js"'));
    const reactDom = porter.packet.find({ name: 'react-dom' });
    assert.ok(!preloadText.includes(`define("react-dom/${reactDom.version}/${reactDom.main}"`));
  });

  it('should be mutually exclusive', async function() {
    const { text: mainText } = await requestPath('/home.js?main');
    const { text: preloadText } = await requestPath('/preload.js');
    const reactDom = porter.packet.find({ name: 'react-dom' });
    const { text: reactText } = await requestPath(`/react-dom/${reactDom.version}/${reactDom.bundle.entry}`);

    const rdefine = /define\("[^"]+"/g;
    const mainIds = mainText.match(rdefine);
    const preloadIds = preloadText.match(rdefine);
    const reactIds = reactText.match(rdefine);

    for (const id of mainIds) {
      expect(preloadIds).to.not.contain(id);
      expect(reactIds).to.not.contain(id);
    }

    for (const id of preloadIds) {
      expect(mainIds).to.not.contain(id);
      expect(reactIds).to.not.contain(id);
    }
  });
});
