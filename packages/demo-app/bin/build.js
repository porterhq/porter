#!/usr/bin/env node

'use strict';

const porter = require('../lib/porter');

async function main() {
  await porter.compileAll({
    entries: ['home.js','test/suite.js', 'stylesheets/app.css'],
  });
  console.log('done');
}

main().catch(function(err) {
  console.error(err.stack);
});
