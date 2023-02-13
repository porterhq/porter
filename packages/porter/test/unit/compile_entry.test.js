'use strict';

const path = require('path');
const expect = require('expect.js');

const Porter = require('../..').default;

describe('porter.compileEntry()', function() {
  const root = path.resolve(__dirname, '../../../../examples/app');
  let porter;

  before(async function() {
    porter = new Porter({
      root,
      preload: 'preload',
      source: { inline: true },
    });
    await porter.ready();
  });

  after(async function() {
    await porter.destroy();
  });

  describe('.compileEntry({ entry, code })', function () {
    it('can compile component with specified code', async function () {
      const { code, map } = await porter.compileEntry({
        entry: 'fake/entry.js',
        code: `
          'use strict'
          var $ = require('yen')
          $('body').addClass('hidden')
        `
      }, { all: true, writeFile: false, loaderConfig: { preload: undefined } });

      expect(code).to.contain('fake/entry.js');
      expect(code).to.contain('yen/1.2.4/index.js');
      expect(code).to.contain('yen/1.2.4/events.js');
      expect(code).to.not.contain('define("preload.js"');
      expect(map.sources).to.contain('porter:///loader.js');
    });
  });

  describe('.compileEntry({ entry, deps, code })', function() {
    it('can compile component with specified deps and code', async function() {
      const { code, map } = await porter.compileEntry({
        entry: 'fake/entry.js',
        deps: ['yen', 'jquery'],
        code: `
          'use strict'
          var $ = require('yen')
          $('body').removeClass('hidden')
        `
      }, { all: true, writeFile: false, loaderConfig: { preload: undefined } });

      const { name, version, main } = porter.packet.find({ name: 'jquery' });
      expect(code).to.contain(`${name}/${version}/${main}`);
      expect(code).to.contain('removeClass');
      expect(map.sources).to.contain('porter:///loader.js');
      expect(map.sources).to.contain('porter:///node_modules/jquery/dist/jquery.js');
    });

    it('can compile component with specified deps and code', async function() {
      const { code, map } = await porter.compileEntry({
        entry: 'fake/entry.js',
        imports: ['yen', 'jquery'],
        code: `
          'use strict'
          var $ = require('yen')
          $('body').addClass('hidden')
        `
      }, { all: true, writeFile: false, loaderConfig: { preload: undefined } });

      const { name, version, main } = porter.packet.find({ name: 'jquery' });
      expect(code).to.contain(`${name}/${version}/${main}`);
      expect(code).to.contain('addClass');
      expect(map.sources).to.contain('porter:///loader.js');
      expect(map.sources).to.contain('porter:///node_modules/jquery/dist/jquery.js');
    });
  });

  describe('.compileEntry({ entry, code }, { loaderConfig })', function() {
    let code;

    before(async function() {
      const result = await porter.compileEntry({
        entry: 'fake/entry.js',
        code: `
          'use strict'
          var $ = require('yen')
          $('body').removeClass('hidden')
        `
      }, {
        all: true,
        writeFile: false,
        loaderConfig: {
          preload: undefined
        }
      });

      code = result.code;
    });

    /**
     * Normally the cache would be `preload:["preload"]`, should be overridden by
     * `{ loaderConfig }`
     */
    it('can override loaderConfig', async function() {
      expect(code).to.not.contain(',preload:["preload"]');
    });

    it('should omit the global preload settings', async function() {
      expect(code).to.not.contain('define("preload.js"');
    });
  });
});
