import expect from 'expect.js';

describe('import.meta.glob()', function() {
  it('import.meta.glob("./*.json", { eager: true }', function() {
    const files = import.meta.glob('./*.json', { eager: true });
    expect(Object.keys(files)).to.eql(['./foo bar.json', './foo.json']);
  });
});
