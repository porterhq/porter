'use strict';

const expect = require('expect.js');

describe('require directory', function() {
  it('require dir', function() {
    require('./math/index'); // distractor
    const math = require('./math');
    expect(math.add(1, 1)).to.be(2);
  });

  it('require dir/', function() {
    const convert = require('./convert/');
    expect(convert.fahrenheit(10)).to.be(50);
  });

  it('require node_modules that require dir/', function() {
    const StackGrid = require('react-stack-grid');
    expect(StackGrid.default).to.be.a(Function);
  });

  it('require node_modules that has its main set to dir', function() {
    const Inferno = require('inferno');
    expect(Inferno.render).to.be.a(Function);
  });
});
