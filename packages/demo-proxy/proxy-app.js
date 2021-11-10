'use strict';

const http = require('http');
const Koa = require('koa');
const path = require('path');
const Porter = require('@cara/porter');
const serve = require('koa-static');

async function createApp() {
  // existing app
  const app = new Koa();
  const root = path.join(__dirname, '../demo-app');
  const porter = new Porter({
    root,
    paths: ['components', 'browser_modules' ],
    entries: ['home.js', 'test/suite.js']
  });
  app.use(porter.async());
  const server = http.createServer(app.callback());

  return new Promise(resolve => {
    server.listen({ port: 0 }, () => {
      console.log('Server started at %s', server.address().port);
      resolve(server);
    });
  });
}

async function fetchConfig(url) {
  const res = await new Promise((resolve, reject) => {
    const req = http.get(url, resolve);
    req.on('error', reject);
  });

  if (res.statusCode !== 200) {
    throw new Error(`Request failed (${res.statusCode}): ${url}`);
  }

  return new Promise((resolve, reject) => {
    let buf = '';
    res.on('data', chunk => buf += chunk);
    res.on('end', () => {
      try {
        resolve(JSON.parse(buf));
      } catch (err) {
        reject(err);
      }
    });
    res.on('error', reject);
  });
}

async function factory() {
  const server = await createApp();
  const baseUrl = `http://localhost:${server.address().port}`;
  const loaderConfig = await fetchConfig(`${baseUrl}/loaderConfig.json`);

  loaderConfig.baseUrl = baseUrl;
  const proxyApp = new Koa();
  const porter = new Porter({ paths: 'components', root: __dirname, ...loaderConfig });

  proxyApp.use(porter.async());
  proxyApp.use(serve('views'));
  proxyApp.use(serve('public'));

  return proxyApp;
}

module.exports = factory;
if (!module.parent) {
  factory()
    .then(proxyApp => {
      const port = process.env.port || 5001;
      proxyApp.listen(port, function() {
        console.log('Proxied server started at %s', port);
      });
    })
    .catch(err => console.error(err.stack));
}
