'use strict';


const path = require('path');
const { strict: assert } = require('assert');
const fs = require('fs/promises');
const Porter = require('@cara/porter');

async function reload(porter, fpath) {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    // https://stackoverflow.com/questions/10468504/why-fs-watchfile-called-twice-in-node
    // recursive option not supported on linux platform, reload again to make sure test passes.
    await porter.packet.reload('change', fpath);
  }
  // {@link Package#watch} takes time to reload
  await new Promise(resolve => setTimeout(resolve, 1000));
}

describe('examplestypescript/test/reload.test.js', function() {
  const root = path.resolve(__dirname, '..');
  const sources = {};
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      entries: ['app.tsx', 'about.tsx'],
      cache: { clean: true },
      // typescript: { compiler: 'babel' },
      resolve: {
        import: [
          { libraryName: 'lodash', libraryDirectory: '', camel2DashComponentName: false, style: false },
        ],
      },
    });
    await porter.ready();
  });

  after(async function() {
    for (const fpath in sources) {
      await fs.writeFile(fpath, sources[fpath]);
    }
    await porter.destroy();
  });

  it('should parse introduced dependencies when reload', async function() {
    const lodash = porter.packet.find({ name: 'lodash' });
    const mod = porter.packet.files['app.tsx'];
    const mark = Math.floor((Math.random() * (16 ** 6))).toString(16).padStart(0);
    const source = await fs.readFile(mod.fpath);
    sources[mod.fpath] = source;
    assert.deepEqual(Object.keys(lodash.entries), ['throttle.js']);

    await fs.writeFile(mod.fpath, `import { debounce } from 'lodash';
${source}
console.log(debounce);
/* ${mark} */`);
    await reload(mod.fpath);
    await mod.obtain();
    assert.deepEqual(Object.keys(lodash.entries), ['throttle.js', 'debounce.js']);
  });
});
