import expect from 'expect.js';
import Button from '../components/button';
import { lowerCase } from '../utils/string.mjs';

describe('import js extensions', function() {
  it('import "../components/button.jsx"', function() {
    expect(Button).to.be.a(Function);
  });

  it('import "../utils/string.mjs"', function() {
    expect(lowerCase).to.be.a(Function);
  });
});

describe('dynamic imports', function() {
  it('import("./foo.jsx")', function(done) {
    import('./foo.jsx').then(function(exports) {
      expect(exports.default).to.be.a(Function);
      done();
    }).catch(err => done(err));
  });
});

describe('import.meta.glob()', function() {
  it('import.meta.glob("./*.json", { eager: true }', function() {
    const files = import.meta.glob('./*.json', { eager: true });
    expect(Object.keys(files)).to.eql(['./foo bar.json', './foo.json']);
  });
})
