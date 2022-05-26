#!/usr/bin/env node

'use strict';

const program = require('commander');

function collectPath(val, paths) {
  paths.push(val);
  return paths;
}

function collectLazyload(val, lazyload) {
  lazyload.push(val);
  return lazyload;
}

function collectInclude(val, includes) {
  includes.push(val);
  return includes;
}

function getExecutablePath() {
  switch (process.platform) {
    case 'darwin':
      return '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
  }
}

program
  .option('-D --dest [dest]', 'public folder', 'public')
  .option('-H --headless [headless]', 'run headless tests right after server is started', false)
  .option('-P --paths [paths]', 'components load path', collectPath, [])
  .option('-p --port [port]', 'port to listen on', 3000)
  .option('-s --suite [suite]', 'run suites right after server is started', 'test/suite')
  .option('-l --lazyload [lazyload]', 'lazy loaded modules', collectLazyload, [])
  .option('-i --include [include]', 'transpile dependencies', collectInclude, [])
  .option('-t --timeout [timeout]', 'timeout on headless tests', 15000);

program.on('--help', function() {
  console.log('  Examples:');
  console.log('');
  console.log('    $ porter serve --port 4000');
  console.log('');
});

program.parse(process.argv);

// const debug = require('debug')('porter')
const fs = require('fs');
const http = require('http');
const Koa = require('koa');
const path = require('path');
const puppeteer = require('puppeteer-core');
const Porter = require('@cara/porter');

const exists = fs.existsSync;

const cwd = process.cwd();
const pkgPath = path.join(cwd, 'package.json');

if (!exists(pkgPath)) {
  console.error('Failed to find package.json');
  process.exit();
}

serve().catch(err => console.error(err.stack));

async function test({ port }) {
  const executablePath = process.env.CHROMIUM_BIN || process.env.CHROME_BIN || getExecutablePath();
  const options = { executablePath };
  if (process.env.CI == 'true') options.args = ['--no-sandbox'];
  const browser = await puppeteer.launch(options);
  const page = await browser.newPage();

  const report = result => {
    const [status, { fullTitle, duration, failures, tests }] = result;
    switch (status) {
      case 'start':
        console.log('');
        break;
      case 'pass':
        console.log(`  ✔ ${fullTitle} (${duration}ms)`);
        break;
      case 'fail':
        console.log(`  ✗ ${fullTitle} (${duration}ms)`);
        break;
      case 'end':
        console.log('');
        if (failures > 0) {
          console.log(`  ✘ ${failures} of ${tests} test${tests > 1 ? 's' : ''} failed.`);
        } else {
          console.log(`  ${tests} test${tests > 1 ? 's' : ''} completed (${duration}ms)`);
        }
        process.exit(failures);
        break;
      default:
        throw new Error(`unknown status '${status}'`);
    }
  };

  const onConsoleMessage = async msg => {
    const args = await Promise.all(msg.args().map(arg => arg.jsonValue()));
    switch (msg.type()) {
      case 'warning':
        console.warn(...args);
        break;
      case 'log':
        const text = args[0] == 'stdout:' ? args[1] : args[0];
        let result;
        try { result = JSON.parse(text); } catch (err) {}
        if (result) {
          report(result);
        } else {
          console.log(...args);
        }
        break;
      default:
        console[msg.type()](...args);
    }
  };

  page.on('console', onConsoleMessage);
  await page.goto(`http://localhost:${port}/runner.html?reporter=json-stream&suite=${program.suite}`, {
    timeout: program.timeout
  });
  await new Promise((resolve, reject) => {
    page.on('error', reject);
    page.on('pageerror', reject);
  });
}

async function serve() {
  const app = new Koa();
  const serveStatic = require('koa-static');
  app.use(serveStatic(path.resolve(cwd, program.dest)));
  app.use(serveStatic(path.join(__dirname, '../public')));

  app.use(async function(ctx, next) {
    if (ctx.path == '/') {
      ctx.redirect('/runner.html');
    } else {
      await next();
    }
  });

  if (program.paths.length == 0) program.paths.push('components');
  const porter = new Porter({
    paths: [...program.paths, path.join(__dirname, '../components')],
    source: { serve: true },
    lazyload: program.lazyload,
    transpile: { include: program.include },
  });
  app.use(porter.async());

  const server = http.createServer(app.callback());
  const port = program.headless ? 0 : program.port;
  await new Promise((resolve, reject) => {
    server.listen({ port }, resolve);
    server.on('error', reject);
  });
  console.log('Server started at', `http://localhost:${server.address().port}`);
  if (program.headless) {
    server.unref();
    await test({ port: server.address().port });
  }
}
