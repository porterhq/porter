'use strict';

const path = require('path');
const Koa = require('koa');
const serve = require('koa-static');
const Porter = require('@cara/porter');
const Pug = require('koa-pug');
const Router = require('@koa/router');

const app = new Koa();
const pug = new Pug({
  viewPath: path.join(__dirname, 'app/views'),
});
pug.use(app);

const router = new Router();
router.get('/about', async (ctx, next) => {
  await ctx.render('default');
});

const porter = new Porter({
  paths: 'app/web',
  resolve: {
    alias: {
      '@': 'app/web',
    },
    extensions: [ '*', '.js', '.jsx', '.css', '.less' ],
    import: {
      libraryName: 'antd',
      style: 'css',
    },
  },
  lessOptions: {
    javascriptEnabled: true,
  },
  source: { serve: true },
});

app.use(serve('public'));
app.use(router.routes());
app.use(router.allowedMethods());
app.use(porter.async());

app.porter = porter;
module.exports = app;

if (!module.parent) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, function() {
    console.log('Server started at %s', `http://localhost:${PORT}`);
  });
}
