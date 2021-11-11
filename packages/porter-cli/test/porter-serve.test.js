'use strict';

/* eslint-env mocha */
const expect = require('expect.js');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const cmd = path.join(__dirname, '../bin/porter-serve.js');
const componentRoot = path.join(__dirname, '../../demo-component');
const appRoot = path.join(__dirname, '../../demo-app');

describe('porter-serve --port', function() {
  it('should be able to change port with --port', async function() {
    const proc = spawn(cmd, ['--port', 9527, '--paths', '.'], { cwd: componentRoot, stdio: ['pipe', 'pipe', process.stderr] });
    await new Promise(resolve => {
      proc.stdout.on('data', chunk => {
        if (chunk.includes('Server started')) resolve();
      });
    });
    const res = await new Promise(resolve => http.get('http://localhost:9527/loader.js', resolve));
    expect(res.statusCode).to.eql(200);
    expect(res.headers['content-type']).to.contain('application/javascript');
    await new Promise(resolve => {
      proc.on('exit', resolve);
      proc.kill();
    });
  });
});

describe('porter-serve component', function() {
  let proc;

  before(async function() {
    proc = spawn(cmd, ['--paths', '.'], { cwd: componentRoot, stdio: ['pipe', 'pipe', process.stderr] });
    await new Promise(resolve => {
      proc.stdout.on('data', chunk => {
        if (chunk.includes('Server started')) resolve();
      });
      // porter-serve runs in daemon, cannot wait for it to exit/close.
    });
  });

  after(async function() {
    await new Promise(resolve => {
      proc.on('exit', resolve);
      proc.kill();
    });
  });

  it('should serve loader', async function() {
    const res = await new Promise(resolve => http.get('http://localhost:3000/loader.js', resolve));
    expect(res.statusCode).to.eql(200);
    expect(res.headers['content-type']).to.contain('application/javascript');
  });

  it('should serve test runner', async function() {
    const res = await new Promise(resolve => http.get('http://localhost:3000/runner.html', resolve));
    expect(res.statusCode).to.eql(200);
    expect(res.headers['content-type']).to.contain('text/html');
  });

  // require('mocha') does not work yet.
  it('should serve mocha', async function() {
    const res = await new Promise(resolve => http.get('http://localhost:3000/node_modules/mocha/mocha.js', resolve));
    expect(res.statusCode).to.eql(200);
    expect(res.headers['content-type']).to.contain('application/javascript');
  });

  it('should be able to access component files', async function() {
    const res = await new Promise(resolve => http.get('http://localhost:3000/index.js?entry', resolve));
    expect(res.statusCode).to.eql(200);
    expect(res.headers['content-type']).to.contain('application/javascript');
  });
});

describe('porter-serve component --headless', function() {
  it('should be able to run component tests headlessly', async function() {
    const proc = spawn(cmd, ['--paths', '.', '--headless'], { stdio: 'inherit', cwd: componentRoot });
    await new Promise((resolve, reject) => {
      proc.on('exit', code => {
        if (code > 0) {
          reject(new Error(`${cmd} existed with non-zero code: ${code}`));
        } else {
          resolve();
        }
      });
    });
  });
});

describe('porter-serve web application', function() {
  let proc;

  before(async function() {
    proc = spawn(cmd, [
      '--paths', 'components',
      '--paths', 'browser_modules',
    ], {
      cwd: appRoot,
      stdio: ['pipe', 'pipe', process.stderr]
    });
    await new Promise(resolve => {
      proc.stdout.on('data', chunk => {
        console.log('' + chunk);
        if (chunk.includes('Server started')) resolve();
      });
    });
  });

  after(async function() {
    await new Promise(resolve => {
      proc.on('exit', resolve);
      proc.kill();
    });
  });

  it('should be able to serve as a full webapp development environment', async function() {
    const res = await new Promise(resolve => http.get('http://localhost:3000/home.js?entry', resolve));
    expect(res.statusCode).to.eql(200);
    expect(res.headers['content-type']).to.contain('application/javascript');
  });

  it('should be able to serve components in another path', async function() {
    const res = await new Promise(resolve => http.get('http://localhost:3000/test/suite.js?entry', resolve));
    expect(res.statusCode).to.eql(200);
    expect(res.headers['content-type']).to.contain('application/javascript');
  });
});

describe('porter-serve web application --headless', function() {
  it('should be able to run web application tests headlessly', async function() {
    const proc = spawn(cmd, [
      '--paths', 'components',
      '--paths', 'browser_modules',
      '--lazyload', 'mad-import/foo.js',
      '--headless'
    ], { stdio: 'inherit', cwd: appRoot });
    await new Promise((resolve, reject) => {
      proc.on('exit', code => {
        if (code > 0) {
          reject(new Error(`${cmd} exits with non-zero code: ${code}`));
        } else {
          resolve();
        }
      });
    });
  });
});
