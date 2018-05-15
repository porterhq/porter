# Porter CLI

Porter CLI is the command line interface of Porter the middleware. Web developers can use Porter CLI to spin up servers for two kinds of projects:

- Standalone **web applications** that manage dependencies with NPM and consumes browser modules in Node.js fashion.
- Isolated **browser modules** that share the same conveniency.

Porter CLI may be installed globally:

```bash
➜  ~ npm install @cara/porter-cli -g
➜  ~ cd /path/to/project
➜  ~ porter serve
```

or as one of the project's `devDependencies`:

```bash
➜  ~ cd /path/to/project
➜  ~ npm install @cara/porter-cli --save-dev
➜  ~ npx porter serve
```

## Developing Web Application

Conventionally, the structure of web application should look like below:

```bash
➜  porter-demo git:(master) tree -L 2
.
├── components        # browser modules
│   ├── app.css
│   └── app.js
├── node_modules      # dependencies
│   ├── @cara
│   ├── jquery
│   └── prismjs
├── package.json
└── public
    └── index.html    # homepage
```

It's worth noting that the frontend code of the web application above is in the directory `./components`, which is the default load paths for browser modules. To start the web app, the default settings shall suffice:

```bash
➜  porter-demo git:(master) npx porter serve
Server started at 5000
```

The equivalent command of the above is:

```bash
➜  porter-demo git:(master) npx porter serve --paths components --dest public --port 5000
Server started at 5000
```

## Developing Browser Modules

Unlike web applications, when developing isolated browser modules (that is meant to be shared as an npm package), the code resides in package root rather than `./components`. Take [porter-component](https://github.com/erzu/porter/tree/master/packages/porter-component) for example.

```bash
➜  porter-component git:(master) tree . -I node_modules
.
├── index.js
├── package.json
└── test
    └── suite.js
```

To start the server for this browser module, we need to change the default paths.

```bash
➜  porter-component git:(master) npx porter serve --paths .
Server started at 5000
```

A default `/runner.html` is provided as well, which use Mocha as the test framework. With test cases laid out in `test/suite.js`, developers may see the test run at <http://localhost:5000/runner.html>, which loads a built-in entry called `/runner.js` to start the process.

To run the test cases automatically at command line, just pass the `--headless` option.

```bash
➜  porter-component git:(master) npx porter serve --paths . --headless --suite test/suite.js

> @cara/porter-component@2.0.0-3 test /Users/nil/Projects/erzu/porter/packages/porter-component
> DEBUG=porter,$DEBUG porter serve --paths . --headless

Server started at 50106

  ✔ yen.fn.reveal() removeClass("hidden") (2ms)

  1 test completed (7ms)
```

## Test Runner

Porter CLI has [Mocha](http://mochajs.org/) opt-in, which means with the default setup, we can start writing test cases right away. To take a quick look of this feature, we can start the server and visit <http://localhost:5000/runner.html>. Here's what happens:

1. `/runner.html` loads `mocha.js`, the entry `/runner.js?main` (which has the loader bundled in).
2. `/runner.js` sets up parameters of mocha, such as `ui`, `reporter`, and `timeout`, by calling `mocha.setup({ ui, reporter, timeout })`.
3. `/runner.js` tries to load `test/suite.js`, which is the default entry of current package's test cases.
4. `mocha.run()` at last.

As the developer of current package, no matter it's web application or browser module, the only thing to worry about here is how to put down meaningful test cases into `test/suite.js`. Take the [test cases of porter-app](https://github.com/erzu/porter/tree/master/packages/porter-app/browser_modules/test/suite.js) for example, `test/suite.js` is just an entry of test cases.

We can override the default Mocha settings by search parameters, such as <http://localhost:5000/runner.html?ui=tdd&timeout=60000>.

As demostrated in *browser module* section, when test cases are ready and we need to put them up with Continuous Integration, we can call Porter CLI with the `--headless` option:

```bash
➜  ~ porter serve --headless
```

This puts Porter CLI in headless mode, which not only start the server, but also tries to open the test page and log the test results, in CLI. If test passes with zero failure, the command exits with 0. On the contrary, the command exits with the number of failures. This makes the headless mode suitable to be put in npm scripts:

```json
{
  "name": "@cara/porter-component",
  "devDependencies": {
    "@cara/porter-cli": "^2.0.0-3"
  },
  "scripts": {
    "start": "porter serve --paths .",
    "test": "DEBUG=porter,$DEBUG porter serve --paths . --headless"
  }
}
```

## Options

### `--dest=public`

The destination directory which holds temporary files, compile results, and (if you wish) static files. The default destination directory is `public`.

```bash
➜  ~ porter serve --dest www
Server started at 5000
```

### `--headless`

Pass this option to run Porter CLI in headless mode. In this mode, Porter CLI performs followin tasks step by step:

1. Start an http server with the port randomly picked.
2. Open the test page `http://localhost:${port}/runner.html` in puppeteer.
3. Output everything the runner page logs, with test suites recognized.

If test suites pass, exit with code 0. Otherwise, exit with the number of failed test cases.

### `--paths`

The load paths of current package. In regular npm packages, the load paths is `.`. In web applications, the load paths is at your command although `components` is the recommended and the default one.

We can setup multiple load paths by repeating the `--paths` option, such as:

```bash
# paths => ["components", "browser_modules"]
➜  ~ porter serve --paths components --paths browser_modules
Server started at 5000
```

### `--port`

The port which the server started by Porter CLI listens to. The default is `5000`.

When `--headless` option is on, this option is trumped.

### `--suite`

The entry of test suites that `/runner.html` tries to load. By default, when visiting <http://localhost:5000/runner.html>, `test/suite.js` of current package will be tried to load. If loaded successfully, and `test/suite.js` did setup a few test cases, `/runner.html` shows the result.

If a different name is preferred, you may pass the name to `--suite` option, such as:

```bash
# test => tests
➜  ~ porter serve --suite tests/suite.js
Server started at 5000
```

### `--timeout`

The timeout on test runner, which defaults to `15000`.

```bash
# a minute
➜  ~ porter serve --timeout 60000
Server started at 5000
```
