'use strict';

window.Buffer = require('buffer').Buffer;
const expect = require('expect.js');

// #1 mocha cannot be required directly yet.
// const mocha = require('mocha')
require('../require-directory/suite');
require('../mad-import/suite');
require('../require-json/suite');
require('../brfs/suite');
require('../dynamic-import/suite');

describe('global', function() {
  it('should equal to window', function() {
    expect(global).to.equal(window);
  });

  it('should define process', function() {
    expect(process.browser).to.be.ok();
    expect(process.env).to.eql({
      BROWSER: true,
      NODE_ENV: process.env.NODE_ENV
    });
  });
});

describe('require uri', function() {
  it('require.async("//example.com/foo.js")', function() {
    require.async('//g.alicdn.com/alilog/mlog/aplus_v2.js', function() {
      expect(window.porter.registry['//g.alicdn.com/alilog/mlog/aplus_v2.js']).to.be.ok();
    });
  });

  it('require("//example.com/foo.js")', function() {
    require('https://a1.alicdn.com/assets/qrcode.js');
    expect(window.QRCode).to.be.a(Function);
  });
});

describe('cyclic modules', function() {
  it('require node_modules that has cyclic dependencies', function() {
    const Color = require('react-color');
    expect(Color.SwatchesPicker).to.be.ok();
  });
});

describe('conditional require', function() {
  it('should only require react.development', function() {
    const version = Object.keys(window.porter.lock.react)[0];
    expect(window.porter.registry['react/' + version + '/cjs/react.production.min.js']).to.be(undefined);
    expect(window.porter.registry['react/' + version + '/cjs/react.development.js']).to.be.ok();
  });
});

describe('conditional require', function() {
  require('react');

  it('should only require react.development', function() {
    const version = Object.keys(window.porter.lock.react)[0];
    expect(window.porter.registry['react/' + version + '/cjs/react.production.min.js']).to.be(undefined);
    expect(window.porter.registry['react/' + version + '/cjs/react.development.js']).to.be.ok();
  });
});

describe('browser field', function() {
  it('should shim stream with readable stream', function() {
    expect(require('stream').Readable).to.be.a(Function);
  });

  it('should recognize relative requires without extension', function() {
    // can't reuqire('brotli') directly yet
    // - https://github.com/foliojs/brotli.js/issues/20
    expect(require('brotli/decompress')).to.be.a(Function);
  });

  it('shim stream with readable-stream', function() {
    expect(require('iconv-lite').encode).to.be.a(Function);
  });
});

describe('missing dep', function() {
  it('should still be accessible if requires missing dependency', function() {
    expect(require('./missing.js')).to.eql({});
  });
});

describe('worker from dependency', function() {
  it('should be able to load dependencies that have web workers', async function() {
    const greeting = require('@cara/demo-worker/');
    expect(greeting).to.be.a(Function);
    const result = await greeting();
    expect(result).to.equal('pong');
  });
});

describe('neglect node.js core modules', function() {
  it('should neglect node.js core modules by default', function() {
    const fontkit = require('fontkit');
    expect(fontkit.create).to.be.a(Function);
  });
});
