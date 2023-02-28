'use strict';

const heredoc = require('heredoc');

test('deheredoc', function() {
  expect(heredoc(function() {/* foobar */})).toEqual('foobar');
});

