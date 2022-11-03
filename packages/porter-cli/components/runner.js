'use strict';

require('mocha/mocha');
require('mocha/mocha.css');

const opts = { ui: 'bdd' };
const params = new URLSearchParams(location.search);

for (const opt of ['ui', 'reporter', 'timeout']) {
  if (params.has(opt)) opts[opt] = params.get(opt);
}

mocha.setup(opts);
const suite = params.get('suite') || 'test/suite';
require.async(suite, function() {
  mocha.run();
});
