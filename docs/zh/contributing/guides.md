---
layout: zh
title: 如何参与
---

## 快速上手

Porter 仓库是一个单仓库多个包的 monorepo，本地跑开发环境需要执行如下命令：

```bash
$ git clone git@github.com:erzu/porter.git
$ cd porter
$ npm install
```

然后就可以开始开发了，编码完成后记得执行测试：

```bash
$ npm run test
```

也可以执行单个仓库的测试：

```bash
# both commands work
$ npm run test --workspace ./packages/porter
$ cd packages/porter && npm run test
```

### 了解目录结构

packages 目录下都是 npm 包，真正会被发布到 npm 的只有 packaegs/porter 和 packages/porter-cli，packages/demo-* 格式的包都是演示或者测试验证用，不会被发布。

### 执行测试

单元测试和集成测试代码基本集中在 packages/porter 目录下，也是 Porter 的主题功能逻辑所在。前文提到了运行整个仓库的测试命令是在根目录执行：

```bash
$ npm run test
```

这个命令会去 packages 下的各个目录中执行对应的 `npm run coverage`，如果没有就跳过。

如果要执行单个包的测试，进入到相应目录再执行相关命令即可，一般就两个：

```bash
$ cd packages/porter
$ npm run test      # 执行测试，忽略覆盖率统计
$ npm run coverage  # 执行测试并统计覆盖率
```

如果需要执行单个测试文件，可以在命令后面加上：

```bash
$ cd packages/porter
$ npm run test -- test/module.test.js
```

## 编写帮助文档

Porter 的帮助文档使用 GitHub Pages 服务自动构建，GitHub Pages 是 Github 基于 Jekyll 命令提供的静态站点发布服务，Jekyll 的具体安装方式可以参考 [macOS 安装 Ruby](https://mac.install.guide/ruby/index.html)，或者参考 Moncef Belyamani 的 [Ruby 安装脚本](https://www.moncefbelyamani.com/ruby-script/)。如果你只想要安装 Jekyll，也可以使用 Homebrew 安装 Ruby，然后再安装 Jekyll 即可：

```bash
$ brew install ruby
$ echo 'export PATH="/usr/local/opt/ruby/bin:$PATH"' >> ~/.zshrc
$ cd docs
$ bundle install
```

如果遇到连接 https://rubygems.org 超时的问题，考虑切换 docs/Gemfile 中使用的 Ruby Gems 源：

```diff
diff --git a/docs/Gemfile b/docs/Gemfile
index 4382725..b4dba82 100644
--- a/docs/Gemfile
+++ b/docs/Gemfile
@@ -1,4 +1,4 @@
-source "https://rubygems.org"
+source "https://gems.ruby-china.com"
```

执行 bundle install 即可在本地使用 Jekyll 构建帮助文档：

```bash
$ cd docs
$ bundle install
$ bundle exec jekyll serve
Configuration file: porter/docs/_config.yml
            Source: porter/docs
       Destination: porter/docs/_site
 Incremental build: disabled. Enable with --incremental
      Generating...
   GitHub Metadata: No GitHub API authentication could be found. Some fields may be missing or have incorrect data.
                    done in 3.73 seconds.
 Auto-regeneration: enabled for 'porter/docs'
    Server address: http://127.0.0.1:4000/
  Server running... press ctrl-c to stop.
```

访问 <http://localhost:4000/porter/> 即可
