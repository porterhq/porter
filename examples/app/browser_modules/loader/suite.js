'use strict';

const expect = require('expect.js');
const { porter } = window;

describe('loader', function() {
  it('porter.merge(target, source)', function() {
    expect(porter.merge(null, {})).to.eql(null);
    expect(porter.merge({}, null)).to.eql({});
    expect(porter.merge({ a: 1 }, { a: 2 })).to.eql({ a: 2 });
    expect(porter.merge({ a: 1 }, { a: 2, b: 3 })).to.eql({ a: 2, b: 3 });
    expect(porter.merge({ a: 1 }, { a: { b: 2 } })).to.eql({ a: { b: 2 } });
    expect(porter.merge({ a: { b: 2 } }, { a: { c: 3 } })).to.eql({ a: { b: 2, c: 3 } });
    expect(porter.merge({
      a: { '1.0.0': { b: 1 } },
    }, {
      a: { '1.0.0': { c: 2 } },
    })).to.eql({
      a: { '1.0.0': { b: 1, c: 2 } },
    });
  });
});
