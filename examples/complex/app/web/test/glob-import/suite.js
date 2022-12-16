import expect from 'expect.js';

describe('import.meta.glob()', function() {
  it('import.meta.glob("./*.json")', async function() {
    const files = import.meta.glob('./*.json', { eager: false });
    expect(Object.keys(files)).to.eql(['./egg ham.json', './egg.json']);
    expect(files['./egg.json']).to.be.a(Function);
    expect((await files['./egg.json']()).default).to.eql({ egg: 'scrambled' });
  });

  it('import.meta.glob("./*.json", { eager: false }', async function() {
    const files = import.meta.glob('./*.json', { eager: false });
    expect(Object.keys(files)).to.eql(['./egg ham.json', './egg.json']);
    expect(files['./egg.json']).to.be.a(Function);
    expect((await files['./egg ham.json']()).default).to.eql({ egg: 'sunside up' });
  });
});
