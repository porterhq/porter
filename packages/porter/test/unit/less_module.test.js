'use strict';

const path = require('path');
const fs = require('fs/promises');
const { strict: assert } = require('assert');
const Porter = require('../..');

describe('test/unit/less_module.test.js', function() {
  const root = path.resolve(__dirname, '../../../demo-complex');
  let porter;

  before(async function() {
    await fs.rm(path.join(root, 'public'), { recursive: true, force: true });
    porter = new Porter({
      root,
      paths: 'app/web',
      entries: [ 'home.jsx', 'about.jsx' ],
      resolve: {
        alias: { '@/': '' },
        extensions: [ '*', '.js', '.jsx', '.css', '.less' ],
        import: {
          libraryName: 'antd',
          css: true,
        },
      },
      lessOptions: { javascriptEnabled: true },
    });
    await porter.ready;
  });

  after(async function() {
    await porter.destroy();
  });

  it('should resolve less module', async function() {
    const entry = porter.packet.files['home.jsx'];
    assert.deepEqual(entry.children.map(mod => path.relative(root, mod.fpath)), [
      'node_modules/react-dom/index.js',
      'node_modules/react/index.js',
      'app/web/home_dep.js',
      'app/web/utils/index.js',
      'node_modules/cropper/dist/cropper.css',
      'app/web/stylesheets/app.less',
    ]);
  });

  it('should transpile', async function() {
    const mod = porter.packet.files['stylesheets/app.less'];
    assert.equal(mod.constructor.name, 'LessModule');
    const { code } = await mod.obtain();
    assert.ok(!code.includes('@theme-color'));
    assert.ok(code.includes('#233333'));
    assert.ok(code.includes('.page'));
  });

  it('should transpile dependencies', async function() {
    const antd = porter.packet.find({ name: 'antd' });
    const style = antd.files['lib/style/default.less'];
    assert.ok(style);
    await assert.doesNotReject(async function() {
      await style.obtain();
    });
  });
});
