'use strict';

const assert = require('assert').strict;

describe('package exports (webpack)', function() {
  it('require pixi3d', function() {
    const pixi3d = require('pixi3d/pixi7');
    assert.ok(pixi3d);
    assert.equal(typeof pixi3d.glTFAsset, 'function');
  });
});
