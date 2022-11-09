import { strict as assert } from 'assert';

describe('import.meta', function() {
  const baseUrl = new URL(window.porter.baseUrl, location.origin);

  it('import.meta => __module.meta', function() {
    const meta = import.meta;
    assert.deepEqual(Object.keys(meta), ['url', 'resolve']);
  });

  it('import.meta.url => __module.meta.url', function() {
    assert.equal(import.meta.url, baseUrl + 'import-meta/suite.js');
  });

  it('import.meta.resolve() => __module.meta.resolve()', function() {
    assert.equal(import.meta.resolve('../index.js'), baseUrl + 'index.js');
  });
});
