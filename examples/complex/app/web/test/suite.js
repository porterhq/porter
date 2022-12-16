import expect from 'expect.js';
import Button from '../components/button';
import { lowerCase } from '../utils/string.mjs';
import './glob-import/suite';
import './glob-import-eager/suite';

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
