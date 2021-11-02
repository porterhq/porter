import expect from 'expect.js';
import Prism from 'prismjs';
import Home from '../home';

describe('demo-typescript', function() {
  it('should be able to import prismjs', function() {
    expect(Prism.highlightAll).to.be.a(Function);
  });

  it('should be able to import app', function() {
    expect(Home).to.be.a(Function);
  });
});
