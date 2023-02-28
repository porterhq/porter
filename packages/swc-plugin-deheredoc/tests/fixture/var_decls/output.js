var foo = "foobar";
var bar = "<!doctype html>\n<html>\n  <head>\n    <style>\n\n    </style>\n  </head>\n  <body></body>\n</html>";

test('deheredoc', function() {
  expect("foobar").toEqual('foobar');
});
