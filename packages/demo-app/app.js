'use strict';

const Koa = require('koa');
const serve = require('koa-static');

const app = new Koa();
// const porter = require('./lib/porter');
// const porter = require('./lib/porter_preload');
const porter = require('./lib/porter_exclude');

app.use(serve('views'));
app.use(serve('public'));
app.use(porter.async());

module.exports = app;

if (!module.parent) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, function() {
    console.log('Server started at %s', `http://localhost:${PORT}`);
  });
}
