var heredoc = require('heredoc');
var foo = heredoc(function() {/* foobar */});
var bar = heredoc(function() {/*
  <!doctype html>
  <html>
    <head>
      <style>

      </style>
    </head>
    <body></body>
  </html>
*/})

test('deheredoc', function() {
  expect(heredoc(function() {/* foobar */})).toEqual('foobar');
});

var baz = heredoc(() => {/*
  arrow function
*/})

console.log(heredoc(() => {/* heredoc as argument */}))
