'use strict';

const assert = require('assert').strict;
const Koa = require('koa');
const request = require('supertest');

const porter = require('../../../demo-app/lib/porter_preload');
const fs = require('fs/promises');

const { readFile, writeFile } = fs;
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

async function checkReload({ packet = porter.packet, sourceFile, targetFile, pathname }) {
  if (!packet.watchers) packet.watch();
  sourceFile = sourceFile || targetFile;
  const sourceModule = await packet.parseFile(sourceFile);
  pathname = pathname || `/${(await packet.parseEntry(targetFile)).id}`;
  const { fpath: sourcePath } = sourceModule;
  await requestPath(pathname);

  const source = await readFile(sourcePath, 'utf8');
  const mark = `/* changed ${Date.now().toString(36)} */`;
  await writeFile(sourcePath, `${source}${mark}`);

  try {
    // https://stackoverflow.com/questions/10468504/why-fs-watchfile-called-twice-in-node
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      await packet.reload('change', sourceFile);
    }
    // {@link Package#watch} takes time to reload
    await new Promise(resolve => setTimeout(resolve, 200));

    const res = await requestPath(pathname);
    assert(res.text.includes(mark));
  } finally {
    await writeFile(sourcePath, source);
  }
}

describe('Porter_readFile()', function() {
  before(async function() {
    await fs.rm(porter.cache.path, { recursive: true, force: true });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  it('should bundle all dependencies unless preloaded', async function() {
    const res = await requestPath('/home.js?main');
    assert.ok(res.text.includes('define("home.js"'));

    // jquery is bundled
    const jquery = porter.packet.find({ name: 'jquery' });
    assert.ok(res.text.includes(`define("jquery/${jquery.version}/${jquery.main}`));

    // react is required by `preload.js` already, hence it should not be bundled here.
    const react = porter.packet.find({ name: 'react' });
    assert.ok(!res.text.includes(`define("react/${react.version}/${react.main}`));
  });

  it("should bundle preload's dependencies", async function() {
    const res = await requestPath('/preload.js');
    assert.ok(res.text.includes('define("preload.js'));

    // yen is bundled
    const yen = porter.packet.find({ name: 'yen' });
    assert.ok(res.text.includes(`define("yen/${yen.version}/${yen.main}`));
  });

  it('should be mutually exclusive', async function() {
    const { text: mainText } = await requestPath('/home.js?main');
    const mainIds = mainText.match(/define\("([^"]+)"/g);
    const { text: preloadText } = await requestPath('/preload.js');
    const preloadIds = preloadText.match(/define\("([^"]+)"/g);

    for (const id of mainIds) assert.ok(!preloadIds.includes(id));
  });

  it('should invalidate preload if dependencies change', async function() {
    await checkReload({
      sourceFile: 'preload_dep.js',
      targetFile: 'preload.js'
    });
  });

  it('should invalidate preload if external dependencies change', async function() {
    await checkReload({
      packet: porter.packet.find({ name: 'yen' }),
      sourceFile: 'index.js',
      pathname: '/preload.js',
    });
  });

  it('should invalidate css if external dependencies change', async function() {
    await checkReload({
      packet: porter.packet.find({ name: 'cropper' }),
      sourceFile: 'dist/cropper.css',
      pathname: '/stylesheets/app.css',
    });
  });

  it('should not override lock in preload', async function() {
    const res = await requestPath('/preload.js?entry');
    assert(!res.text.includes('Object.assign(porter.lock'));
  });
});
