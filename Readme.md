[![NPM Downloads](https://img.shields.io/npm/dm/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![NPM Version](http://img.shields.io/npm/v/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![codecov](https://codecov.io/gh/porterhq/porter/branch/master/graph/badge.svg?token=9CNWJ1N4T9)](https://codecov.io/gh/porterhq/porter)

[中文版](./Readme.zh-CN.md)

Porter is a bundler which makes web applications with hybrid module formats easier to compile the assets and mitigate browser compatibility nuances.

## User Guides

It is recommended to first start with our [starter](https://porterhq.github.io/porter/starter) documentation or the thorough [user guides](https://porterhq.github.io/porter/basics).


## Packages

Porter consists of two major packages, [@cara/porter](https://github.com/porterhq/porter/tree/master/packages/porter) the middleware and [@cara/porter-cli](https://github.com/porterhq/porter/tree/master/packages/porter-cli) the command line interface. These are the two packages we publish to NPM.

Packages for demo or test purposes now resides in the examples directory. For users interested in porter-cli,

- examples/component may be referenced as a demo of using porter-cli to develop a browser module.
- examples/cli may be referenced as a demo of using porter-cli to develop a web application.

As of examples/app, users interested in porter the middleware may take the `app.js` in examples/app for example. Many options of porter the middleware, and edge cases of browser modules in NPM, are tested in examples/app. Pardon if you find the code within examples/app a bit messy.

## How to Contribute

To learn more about the project setup of Porter, please read our [contributing guides](https://porterhq.github.io/porter/contributing/guides).
