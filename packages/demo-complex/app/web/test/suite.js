import expect from 'expect.js';
import Button from '../components/button';
import { lowerCase } from '../utils/string.mjs';

describe('import js extensions', function() {
  it('import "./button.jsx"', function() {
    expect(Button).to.be.a(Function);
  });

  it('import "./string.mjs"', function() {
    expect(lowerCase).to.be.a(Function);
  });
});
