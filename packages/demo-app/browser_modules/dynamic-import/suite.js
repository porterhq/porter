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
    });
  });

  it('should fetch script when import(dynamic)', function(done) {
    import('chart.js').then(function(exports) {
      expect(exports).to.be.a(Function);
      done();
    });
  });

  it('should not initiate request when import(unknown)', function(done) {
    import('./missing.js').then(function(exports) {
      expect(exports).to.eql({ default: {} });
      done();
    });
  });

  it('should fetch relative dep when import(dynamic)', function(done) {
    import('./sum.js').then(function(exports) {
      expect(exports).to.be.a(Function);
      expect(exports(1, 2)).to.eql(3);
      done();
    });
  });
});
