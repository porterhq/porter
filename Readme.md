[![NPM Downloads](https://img.shields.io/npm/dm/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![NPM Version](http://img.shields.io/npm/v/@cara/porter.svg?style=flat)](https://www.npmjs.com/package/@cara/porter)
[![Build Status](https://travis-ci.org/erzu/porter.svg)](https://travis-ci.org/erzu/porter)
[![codecov](https://codecov.io/gh/erzu/porter/branch/master/graph/badge.svg?token=9CNWJ1N4T9)](https://codecov.io/gh/erzu/porter)

Porter is a bundler which makes web applications with hybrid module formats easier to compile the assets and mitigate browser compatibility nuances.

## User Guides

It is recommended starting with our [starter](https://erzu.github.io/porter/starter) documentation or the thorough [user guides](https://erzu.github.io/porter/basics).

推荐阅读《[快速上手](https://erzu.github.io/porter/zh/starter)》和《[帮助手册]](https://erzu.github.io/porter/zh/basics)》。

## Packages

Porter consists of two major packages, [@cara/porter](https://github.com/erzu/porter/tree/master/packages/porter) the middleware and [@cara/porter-cli](https://github.com/erzu/porter/tree/master/packages/porter-cli) the command line interface. These are the two packages we publish to NPM.

The rest of the packages are mostly for demo or test purpose. For users interested in porter-cli,

- demo-component may be referenced as a demo of using porter-cli to develop a browser module.
- demo-cli may be referenced as a demo of using porter-cli to develop a web application.

As of demo-app, users interested in porter the middleware may take the `app.js` in demo-app for example. Many options of porter the middleware, and edge cases of browser modules in NPM, are tested in demo-app. Pardon if you find the code within demo-app a bit messy.

## How to Contribute

To learn more about the project setup of Porter, please read our [contributing guides](https://erzu.github.io/porter/contributing/guides).

无论是提问题还是需求，是参与开发还是编写文档，我们都非常欢迎大家参与，可以阅读我们的《[如何参与](https://erzu.github.io/porter/zh/contributing/guides)》帮助文档了解更多。
