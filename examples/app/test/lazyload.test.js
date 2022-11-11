'use strict';

const assert = require('assert').strict;
const Koa = require('koa');
const path = require('path');
const fs = require('fs/promises');

const Porter = require('@cara/porter');
const root = path.resolve(__dirname, '..');

const app = new Koa();
const porter = new Porter({
  root,
  paths: ['components', 'browser_modules'],
  lazyload: ['lazyload'],
});
app.use(porter.async());

describe('Porter_readFile()', function() {
  before(async function() {
    await fs.rm(porter.cache.path, { recursive: true, force: true });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  it('should mark lazyloaded dependencies', async function() {
    const packet = porter.packet.find({ name: 'path' });
    assert.equal(packet.lazyloaded, true);
  });

  it('should manifest lazyloaded dependencies in loaderConfig.json', async function() {
    const packet = porter.packet.find({ name: 'path' });
    const result = await porter.readFile('loaderConfig.json');
    const { lock } = JSON.parse(result[0]);
    const { bundle, name, version, main } = packet;
    assert.ok(bundle);
    assert.equal(bundle.output, lock[name][version].manifest[main]);
  });

  it('should manifest lazyloaded dependencies even if preloaded already', async function() {
    const packet = porter.packet.find({ name: 'yen' });
    const result = await porter.readFile('loaderConfig.json');
    const { lock } = JSON.parse(result[0]);
    const { bundle, name, version, main } = packet;
    assert.ok(bundle);
    assert.equal(bundle.output, lock[name][version].manifest[main]);
  });
});
