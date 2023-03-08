test('import.meta.glob', function() {
  const files = import.meta.glob('./*.json');
  expect(Object.keys(files)).toEqual([
    './foo bar.json',
    './foo.json',
  ]);
});
