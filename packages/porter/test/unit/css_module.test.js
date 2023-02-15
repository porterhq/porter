'use strict';

const path = require('path');
const assert = require('assert').strict;
const Porter = require('../..').default;
const { MODULE_LOADED } = require('../../src/constants');
const CssModule = require('../../src/css_module').default;

describe('CssModule', function() {
  const root = path.resolve(__dirname, '../../../../examples/app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      paths: ['components', 'browser_modules'],
      entries: ['home.js', 'stylesheets/app.css'],
      cache: { clean: true },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  it('should parse @import in given order', async function() {
    const mod = porter.packet.files['stylesheets/app.css'];
    assert.deepEqual(mod.children.map(child => path.relative(porter.root, child.fpath)), [
      'components/stylesheets/common/base.css',
      '../../node_modules/cropper/dist/cropper.css',
      '../../node_modules/prismjs/themes/prism.css',
    ]);
  });

  it('should transpile css module', async function() {
    const mod = porter.packet.files['stylesheets/app.css'];
    const result = await mod.load();
    await assert.doesNotReject(async function() {
      await mod.transpile(result);
    });
  });

  it('should transpile with correct source map', async function() {
    const mod = porter.packet.files['stylesheets/app.css'];
    const { map } = await mod.obtain();
    assert.deepEqual(map.sources, [
      'porter:///components/stylesheets/app.css',
    ]);
  });

  it('should set status to MODULE_LOADED after parse', async function() {
    const mod = porter.packet.files['stylesheets/app.css'];
    assert.equal(mod.status, MODULE_LOADED);
  });

  describe('matchImport()', function() {
    it('should handle @import "/foo.css;', function() {
      const mod = Object.create(CssModule.prototype);
      mod.matchImport('@import "./style/index.css";');
      assert.deepEqual(mod.imports, ['./style/index.css']);
    });

    it('should handle @import url("./foo.css");', function() {
      const mod = Object.create(CssModule.prototype);
      mod.matchImport('@import url(../../theme/index.css);\nbody { margin: 0; }');
      assert.deepEqual(mod.imports, ['../../theme/index.css']);
    });
  });
});
