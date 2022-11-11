'use strict';

const expect = require('expect.js');

describe('dynamic import', function() {
  it('should recognize require.async(specifier)', function(done) {
    require.async('react', function(exports) {
      expect(exports.Component).to.be.a(Function);
      done();
    });
  });

  it('should work when import(existing)', function(done) {
    import('react').then(function(exports) {
      expect(exports.Component).to.be.a(Function);
      done();
    }).catch(err => done(err));
  });

  it('should fetch script when import(dynamic)', function(done) {
    import('chart.js').then(function(exports) {
      expect(exports).to.be.a(Function);
      done();
    }).catch(err => done(err));
  });

  it('should not initiate request when import(unknown)', function(done) {
    import('./missing.js').then(function(exports) {
      expect(exports).to.eql({ default: {} });
      done();
    }).catch(err => done(err));
  });

  it('should fetch relative dep when import(dynamic)', function(done) {
    import('./sum.js').then(function(exports) {
      expect(exports).to.be.a(Function);
      expect(exports(1, 2)).to.eql(3);
      done();
    }).catch(err => done(err));
  });

  it('should request css dependencies of dynamic imports', function(done) {
    import('./foo.js').then(function(exports) {
      expect(exports.foo).to.equal('bar');
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      const link = Array.from(links).find(el => /foo\.[0-9a-f]{8}.css$/.test(el.href));
      expect(link).to.be.ok();
      done();
    }).catch(err => done(err));
  });

  it('should request indirect css dependencies of dynamic imports', function(done) {
    // bar.js -> baz.css
    import('./bar.js').then(function(exports) {
      expect(exports.bar).to.equal('baz');
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      const link = Array.from(links).find(el => /bar\.[0-9a-f]{8}.css$/.test(el.href));
      expect(link).to.be.ok();
      done();
    }).catch(err => done(err));
  });
});
