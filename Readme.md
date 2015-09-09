# Oceanify

Oceanify is yet another solution for browser modularization. It features
module transformation on the fly and a swift setup.

## tl;dr

With Oceanify, you can write web pages and applications in old style but can
also take advantage of the modular pattern:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Oceanify Rocks!</title>
  <link rel="stylesheet" type="text/css" href="/main.css">
</head>
<body>
  <h1>Oceanify Rocks!</h1>
  <script src="/main.js"></script>
</body>
</html>
```

In `main.js`, you can `require` dependencies:

```js
var $ = require('jquery')
var cropper = require('cropper')

var nav = require('./nav')

// setup page with those required components and modules
```

And you can do the same in `main.css`:

```css
@import '/cropper/dist/cropper.css';  /* stylesheets in node_modules */
@import './nav.css';                  /* stylesheets in components */
```

When you want your web pages and application be production ready, simply run:

```js
var co = require('co')
var oceanify = require('oceanify')

co([
  oceanify.compileAll(),          // js components and modules
  oceanify.compileStyleSheets()   // css files
])
  .then(function() {
    console.log('assets compiled.')
  })
  .catch(function(err) {
    console.error(err.stack)
  })
```


## Structure

Oceanify introduces a code organization pattern like below:

```bash
.
├── components          # browser modules
│   ├── stylesheets
│   │   ├── base.css
│   │   └── iconfont.css
│   ├── arale
│   │   └── upload.js
│   ├── main.js
│   └── main.css
└── node_modules        # dependencies
    └── yen
        ├── events.js
        ├── index.js
        └── support.js
```

All the dependencies are at `node_modules` directory. All of project's browser
code, js and css, are put at `components` folder. In `components`, you can
`require` and `@import` dependencies from `components` and `node_modules`.

Here's `main.js` would look like:

```js
var $ = require('yen')              // require a module from node_modules
var Upload = require('arale/upload')  // require other modules in components


var upload = new Upload('#btn-upload', { ... })

$('form').on('submit', function() {
  // ...
})
```

And here's `main.css`:

```css
@import './stylesheets/base.css';
@import './stylesheets/iconfont.css';
```


## Usage

To use Oceanify one must be aware that there are two versions of it. The one
you're reading about is a middleware for Express and Koa. The other is a command
line tool built upon Oceanify, called [Oceanifier][oceanifier].

Anyway, to use Oceanify in your Koa instance, just `app.use` it.

```js
var koa = require('koa')
var oceanify = require('oceanify')

var app = koa()

// that's it
app.use(oceanify())
```

If you'd prefer your browser modules in some other names rather than the
default `components`, you can tell Oceanify that with the base option.

```js
app.use(oceanify({ base: 'browser_modules' }))
```

If Express is the framework you're using, you need to tell Oceanify about it:

```js
var express = require('express')
var oceanify = require('oceanify')

var app = express()

// that's it
app.use(oceanify({ express: true }))
```


## Options

### `base`

The directory that your components are put in. The default is `components`.


### `cacheExcept`

By default, Oceanify caches node modules transformations by compiling them once
they are accessed. The compiled result will be put in the path specified by the
`dest` option.

If you want to fiddle with some of these modules, you can tell Oceanify to
ignore them through `cacheExcept` option like:

```js
app.use(oceanify({ cacheExcept: 'heredoc' }))
app.use(oceanify({ cacheExcept: ['heredoc', 'yen'] }))
```

To turn off the caching of js modules completely, pass `*` to `cacheExcept`:

```js
app.use(oceanify({ cacheExcept: '*' }))
```


### `root`

**This option shall not be used much. It is for test purposes.**

By default, Oceanify uses `process.cwd()` as the `root`. In test cases like
`test/test.index.js` in the source code, we need to change the `root` to
`path.join(__dirname, 'test/example')`.

You don't need this option.


### `dest`

The folder to store compiled caches. The cache feature requires middleware like
`koa-static` to function properly:

```js
// koa
app.use(require('koa-static')(path.join(__dirname, 'public')))
app.use(requrie('oceanify')({ dest: 'public' }))

// express
app.use(express.static(path.join(__dirname, 'public')))
app.use(requrie('oceanify')())    // public is the default
```

The stylesheet feature uses the option too. When compiling CSS from
`components`, Oceanify will generate the correspondent source map and put it
into the folder specified by `dest` option.


### `express`

By default, the middleware returned by `oceanify()` is in Koa format. To make
Oceanify function properly in Express, we need to tell Oceanify about it:

```js
app.use(require('oceanify')({ express: true }))
```


### `self`

Normally we won't be needing this option. This option is for Oceanifier mostly.
However, when developing a browser module, we might need to require js files
outside of the components folder.

Take heredoc for example, the test codes are shared between Node and browser.
In `test/test.heredoc.js`, it requires `../index`. When `self` option is turned
on, the wrapped result of `test/test.heredoc.js` will be something like:

```js
define('test/test.heredoc', ['should', 'heredoc/index'], function(require, exports, module) {
  var heredoc = require('heredoc/index')
  // ...
})
```

Otherwise Oceanifier will fail to serve `../index` from `test/test.heredoc`.


## How Does It Work

### CMD on the Fly

At first glance this seems a bit of black magic. How can browser know where to
`require` when executing `main.js`? The secret is all of the js files in both
`components` and `node_modules` will be wrapped into Common Module Declaration
format on the fly:

```js
define(id, deps, function(require, exports, module) {
  // actual main.js content
})
```

The `id` is deducted from the file path. The `dependencies` is extracted from
the factory code thanks to the [match-require][match-require] module. The
`factory` is left untouched for now.

As of `main.js`, the wrapping does a little bit further. Oceanify will put two
things before the wrapped `main.js`.

1. Loader
2. System data


### Loader

But where is the loader? you might ask.

No matter CMD, AMD, or whatever MD, we gonna need a module loader. To support
the dependencies tree in `node_modules`, we forked a CMD module loader called
[sea.js][seajs], which is popular in China.

The loader provided by Oceanify flattens the tree generated by NPM. If the tree
were something like:

```bash
➜  heredoc git:(master) ✗ tree node_modules -I "mocha|standard"
node_modules
└── should
    ├── index.js
    ├── node_modules
    │   ├── should-equal
    │   │   ├── index.js
    │   │   └── package.json
    │   ├── should-format
    │   │   ├── index.js
    │   │   └── package.json
    │   └── should-type
    │       ├── index.js
    │       └── package.json
    └── package.json
```

It will be flattened into:

```js
{
  "should": {
    "6.0.3": {
      "main": "./lib/should.js",
      "dependencies": {
        "should-type": "0.0.4",
        "should-format": "0.0.7",
        "should-equal": "0.3.1"
      }
    }
  },
  "should-type": {
    "0.0.4": {}
  },
  "should-format": {
    "0.0.7": {
      "dependencies": {
        "should-type": "0.0.4"
      }
    }
  },
  "should-equal": {
    "0.3.1": {
      "dependencies": {
        "should-type": "0.0.4"
      }
    }
  }
}
```

The original dependency path `should/should-type` is now put into the same
level. There are `dependencies` Object still, to store the actual version that
is required by `should`.

Notice the structure supports multiple versions. So if your project uses jQuery
1.x but a module you'd like to require uses jQuery 2.x, you can just lay back
and be relaxed. But IMHO, requiring two or even more versions of libraries like
jQuery is a little bit heavy.


### System Data

Except the `system.modules` metioned above, the system data contains other
informations too. Take heredoc for example, the generated system data looks
like below:

```js
{
  "base": "http://localhost:5000",
  "cwd": "http://localhost:5000",
  "main": "runner",
  "modules": { ... },
  "dependencies": {
    "heredoc": "1.3.1",
    "should": "6.0.3"
  }
}
```

- `base` is the root path of components and node modules.
- `cwd` is the host part of `location.href`. If there's no `base` specified,
  `base` will be `cwd`.
- `main` is the main entrance of the tree.
- `modules` is the flattened dependencies tree.
- `dependencies` is the map of all the dependencies required by components.


### Wrap It Up

So here's the flow:

1. Browser requests `/main.js`;
2. Oceanify prepares the content of `/main.js` with 1) Loader, 2) System data,
   and 3) the wrapped `main.js` module;
3. Browser executes the returned `/main.js`, Loader kicks in;
4. Loader resolves the dependencies of `main.js` module;
5. Browser requests the dependencies per Loader's request;
6. Loader executes the factory of `main.js` once all the dependencies are
   resolved.


## Why Oceanify

### A Wrapper for SeaJS

Oceanify starts as a wrapper for SeaJS. But SeaJS comes short when we need
multiple versions coexist in the same page. In SeaJS the `require` has no
context. In Node however, the `require` traverses up all the way.

So we write our own Loader for Oceanify.


### Why Not Webpack?

That's a little bit difficult to answer. When the first version of Oceanify is
developed, we weren't aware of Webpack yet. When Webpack got popular, Oceanify
meets most of our requirements already.

From the technical perspective, Oceanify is a bit like browserify. It's built
upon the ecosystem of NPM. With Oceanify, you can require modules installed via
NPM directly but there's nothing else. There isn't much of transformers to
configure.


### Why Not Browserify?

In the projects from our work that use Oceanify, the wrap on the fly and
`require.async` features are the two we liked a lot. With wrap on the fly, we
don't need to setup a file watcher or something similar. With `require.async`,
we can migrate history code with ease.


### Wrap It Up

I have to admit that the points made in why not webpack or browserify are pale.
Webpack has a middleware to build on the fly too. With enough time spent on
browserify and its ecosystem, we probably can setup something similar with
Oceanify too.

But it's really hard to give Oceanify up just yet.


## Deployment

Oceanfiy provides two static methods for assets precompilation. It's called
`oceanify.compileAll()` and `oceanify.compileStyleSheets()`.


### `.compileAll*([options])`

`.compileAll([options])` is a generator function. You need to wrap the returned
generator object to make it function properly.

```js
var co = require('co')
var oceanify = require('oceanify')

// Specify the entry modules
co(oceanify.compileAll({ base: './components', dest: './public' }))
  .then(function() {
    console.log('done')
  })
  .catch(function(err) {
    console.error(err.stack)
  })

// You can omit the options since they're the defaults.
co(oceanify.compileAll())
```

Oceanify will compile all the modules within `components` directory, find their
dependencies in `node_modules` directory and compile them too.

You can try the one in [Oceanify Example][oceanify-example]. Just execute
`npm run precompile`.


### `.compileStyleSheets*([options])`

`.compileStyleSheets([options])` is a generator function. You need to wrap the
returned generator object to make it function properly.

```js
var co = require('co')
var oceanify = require('oceanify')

co(oceanify.compileStyleSheets({ base: './components', dest: './public' }))
  .then(function() {
    console.log('done')
  })
  .catch(function() {
    console.error(err.stack)
  })
```

Currenty `.compileStyleSheets` just process the source code with autoprefixer
and postcss-import. You gonna need some minification tools like
[cssnano][cssnano].



[loaders]: http://www.zhihu.com/question/22739468/answer/29949594
[yen]: https://github.com/erzu/yen
[ez-editor]: https://github.com/erzu/ez-editor
[oceanify-example]: https://github.com/erzu/oceanify/tree/master/test/example
[oceanifier]: https://github.com/erzu/oceanifier
[cssnano]: https://github.com/ben-eb/cssnano
[seajs]: https://github.com/seajs/seajs
[match-require]: https://github.com/yiminghe/match-require
