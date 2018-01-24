# Oceanifer

A command line tool that helps browser module development.


## Usage

Take some components that are developed using Oceanifier for example:

1. [yen][yen]
2. [ez-editor][ez-editor]
3. [heredoc][heredoc]

The directory structure of yen looks like this:

```bash
➜  yen git:(master) tree . -I node_modules
.
├── History.md
├── Readme.md
├── easing.js
├── events.js
├── index.js
├── package.json
└── test
    ├── runner.html
    ├── runner.js
    ├── test.events.js
    └── test.yen.js

6 directories, 6 files
```

Start the server with `ocean serve`:

```bash
➜  yen git:(master) ocean serve      # --port 5000
```

Then we can access `test/runner.html` via <http://localhost:5000/test/runner.html>.
The magic lies in `runner.js`. In `runner.js` you can simply `require` any
module you need.

```js
mocha.setup('bdd')

require('./test.events')
require('./test.yen')

mocha.run()
```

As a matter of fact, every `.js` in `test` folder has the ability to require
dependencies. Hence in both `test/test.yen.js` and `test/test.events.js`, we can
do something like:

```js
var yen = require('yen')
var expect = require('expect')

describe('yen', function() {
  it('works', function() {
    expect(yen('body')).to.be.a(yen)
  })
})
```

Oceanifier is smart enough to know that `yen` is a local module that reflects
the `package.json` in current working directory.


## How Does It Work

Behind the curtain, there is Oceanify. Oceanify introduces a code organization
pattern like below:

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

It provides a middleware to serve these components and modules. When browser
requests kicks in, Oceanify will process and wrap them automatically.



[oceanify]: https://github.com/erzu/oceanify
[yen]: https://github.com/erzu/yen
[ez-editor]: https://github.com/erzu/ez-editor
[heredoc]: https://github.com/jden/heredoc
