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
