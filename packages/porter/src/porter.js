'use strict';

const atImport = require('postcss-import');
const crypto = require('crypto');
const debug = require('debug')('porter');
const { existsSync, promises: fs } = require('fs');
const mime = require('mime');
const path = require('path');
const postcss = require('postcss');
const { SourceMapGenerator } = require('source-map');
const util = require('util');

const { lstat, readFile, writeFile } = fs;

const FakePackage = require('./fake_packet');
const Package = require('./packet');
const mkdirp = util.promisify(require('mkdirp'));

const rExt = /\.(?:css|gif|jpg|jpeg|js|png|svg|swf|ico)$/i;
const { rModuleId } = require('./module');
const Bundle = require('./bundle');

class Porter {
  constructor(opts) {
    const root = opts.root || process.cwd();
    const paths = [].concat(opts.paths == null ? 'components' : opts.paths).map(loadPath => {
      return path.resolve(root, loadPath);
    });
    const dest = path.resolve(root, opts.dest || 'public');
    const transpile = { only: [], ...opts.transpile };
    const cache = { dest, ...opts.cache };
    const bundleExcept = opts.bundle && opts.bundle.except || [];

    Object.assign(this, { root, dest, cache, transpile, bundleExcept });
    const pkg = opts.package || require(path.join(root, 'package.json'));

    cache.dest = path.resolve(root, cache.dest);

    this.moduleCache = {};
    this.packageCache = {};

    this.package = opts.package
      ? new FakePackage({ dir: root, paths, app: this, package: opts.package, lock: opts.lock })
      : new Package({ dir: root, paths, app: this, package: pkg });

    this.baseUrl = opts.baseUrl || '/';
    this.map = opts.map;
    // Ignition timeout
    this.timeout = 30000;

    this.entries = [].concat(opts.entries || []);
    this.preload = [].concat(opts.preload || []);
    this.lazyload = [].concat(opts.lazyload || []);

    this.source = { serve: false, root: '/', ...opts.source };
    this.cssTranspiler = postcss([
      atImport({
        path: paths,
        resolve: this.atImportResolve.bind(this)
      }),
      ...(opts.postcssPlugins || []),
    ]);
    this.ready = this.prepare(opts);
  }

  async atImportResolve(id, baseDir, importOptions) {
    if (id.startsWith('.')) return path.join(baseDir, id);

    const [fpath] = await this.package.resolve(id);
    if (fpath) return fpath;

    const [, name, , file] = id.match(rModuleId);
    if (name in this.package.dependencies) {
      const pkg = this.package.dependencies[name];
      const result = await pkg.resolve(file);
      return result[0];
    } else {
      return id;
    }
  }

  readFilePath(fpath) {
    return Promise.all([
      readFile(fpath),
      lstat(fpath).then(stats => ({ 'Last-Modified': stats.mtime.toJSON() }))
    ]);
  }

  async readBuiltinJs(name) {
    const fpath = path.join(__dirname, '..', name);
    const result = await this.readFilePath(fpath);

    if (name == 'loader.js') {
      result[0] = await this.package.parseLoader(this.package.loaderConfig);
    }

    return result;
  }

  async pack() {
    const { package: pkg, entries, preload } = this;

    for (const dep of pkg.all) {
      if (dep !== pkg) await dep.pack();
    }

    for (const file of preload.concat(entries)) {
      const bundle = pkg.bundles[file] || Bundle.create({ packet: pkg, entries: [ file ] });
      await bundle.obtain();
    }
  }

  prepareFiles(files, isEntry = false) {
    const { package: pkg } = this;
    return files.map(async function prepareFile(file, i) {
      const mod = isEntry ? await pkg.parseEntry(file) : await pkg.parseFile(file);
      // normalize file name
      if (mod) files[i] = mod.file;
    });
  }

  async prepare(opts = {}) {
    const { package: pkg } = this;
    const { entries, lazyload, preload } = this;

    // enable envify for root package by default
    if (!pkg.browserify) pkg.browserify = { transform: ['envify'] };

    await pkg.prepare();

    await Promise.all([
      ...this.prepareFiles(preload),
      ...this.prepareFiles(entries, true),
      ...this.prepareFiles(lazyload),
    ]);

    for (const file of preload) {
      const entry = await pkg.files[file];
      entry.isPreload = true;
      for (const mod of entry.family) mod.preloaded = !mod.package.isolated;
    }

    for (const file of lazyload) {
      const bundle = Bundle.create({ packet: pkg, entries: [ file ], package: false });
      pkg.bundles[file] = bundle;
      await bundle.obtain();
    }

    await this.pack();

    const { cache } = this;
    await fs.rm(path.join(cache.dest, '**/*.{css,js,map}'), { recursive: true, force: true });
  }

  async compilePackages(opts) {
    for (const pkg of this.package.all) {
      if (pkg.parent) {
        await pkg.compileAll(opts);
      }
    }
  }

  async compileExclusivePackages(opts) {
    for (const name of this.bundleExcept) {
      const packages = this.package.findAll({ name });
      for (const pkg of packages) await pkg.compileAll(opts);
    }
  }

  async compileAll({ entries, sourceRoot }) {
    debug('init');
    await this.ready;

    debug('parse');
    if (entries) {
      await Promise.all(entries.map(entry => this.package.parseEntry(entry)));
    } else {
      entries = Object.keys(this.package.entries);
    }

    debug('minify');
    await Promise.all(Array.from(this.package.all).reduce((tasks, pkg) => {
      tasks.push(...Object.values(pkg.files).map(mod => mod.minify()));
      return tasks;
    }, []));

    debug('compile packages');
    if (this.preload.length > 0) {
      await this.compileExclusivePackages({ all: true });
    } else {
      await this.compilePackages();
    }

    debug('compile preload');
    const manifest = {};
    for (const file of this.preload) {
      await this.package.compile(file, { all: this.preload.length > 0, manifest });
    }

    debug('compile lazyload');
    for (const file of this.lazyload) {
      for (const mod of this.package.files[file].family) {
        await mod.package.compile(mod.file, { package: false, manifest });
      }
    }

    debug('compile entries');
    for (const entry of entries) {
      await this.package.compile(entry, { all: this.preload.length > 0, manifest });
    }

    debug('manifest.json');
    await fs.writeFile(path.join(this.root, 'manifest.json'), JSON.stringify(manifest, null, 2));

    debug('done');
  }

  async compileEntry(entry, opts) {
    return this.package.compile(entry, opts);
  }

  async isRawFile(file) {
    if (!this.source.serve) return false;

    if (file.startsWith('node_modules')) {
      const [, name] = file.replace(/^node_modules\//, '').replace(/^_@?[^@]+@[^@]+@/, '').match(rModuleId);
      // #1 cannot require('mocha') just yet
      return this.package.find({ name }) || name == 'mocha';
    }

    // FIXME: packages/demo-component has package paths set to `.` which makes source serving error prone because the pathnames of source and the output are the same.
    if (this.package.paths.includes(this.root)) return false;

    const fpath = path.join(this.root, file);
    for (const dir of this.package.paths) {
      if (fpath.startsWith(dir) && existsSync(fpath)) return true;
    }

    return false;
  }

  async readRawFile(file) {
    const fpath = path.join(this.root, file);

    if (existsSync(fpath)) {
      return this.readFilePath(fpath);
    }
  }

  async parseId(id, { isEntry } = {}) {
    let [, name, version, file] = id.match(rModuleId);

    if (!version) {
      const { package: pkg } = this;
      name = pkg.name;
      version = pkg.version;
      file = id;
    }

    const pkg = this.package.find({ name, version });
    if (!pkg) throw new Error(`unknown dependency ${id}`);

    const mod = isEntry ? await pkg.parseEntry(file) : await pkg.parseFile(file);
    if (mod) return mod;

    const bundle = pkg.bundles[file];
    // @babel/runtime has no main
    if (bundle) return { file, fake: true, package: pkg };
  }

  async writeSourceMap({ bundle, code, map }) {
    if (map instanceof SourceMapGenerator) {
      map = map.toJSON();
    }

    map.sources = map.sources.map(source => source.replace(/^\//, ''));
    const { output } = bundle;
    code += output.endsWith('.js')
      ? `\n//# sourceMappingURL=${path.basename(output)}.map`
      : `\n/*# sourceMappingURL=${path.basename(output)}.map */`;

    const fpath = path.join(this.cache.dest, bundle.outputPath);
    await mkdirp(path.dirname(fpath));
    await Promise.all([
      writeFile(fpath, code),
      writeFile(`${fpath}.map`, JSON.stringify(map, (k, v) => {
        if (k !== 'sourcesContent') return v;
      }))
    ]);

    return { code };
  }

  async readCss(id, query) {
    id = id.replace(/\.[a-f0-9]{8}\.css$/, '.css');
    const isEntry = true;
    const mod = await this.parseId(id, { isEntry });
    if (isEntry) await this.pack();

    const { mtime } = await lstat(mod.fpath);
    const { package: pkg } = mod;
    const bundle = pkg.bundles[mod.file];
    if (!bundle) throw new Error(`unknown bundle ${mod.file} in ${pkg.name}`);
    const result = await bundle.obtain();
    const { code } = await this.writeSourceMap({ bundle, ...result });

    return [
      code,
      { 'Last-Modified': mtime.toJSON()
    }];
  }

  async readJs(id, query) {
    const isMain = id.endsWith('.js') && 'main' in query;
    const isEntry = isMain || 'entry' in query;
    id = id.replace(/\.[a-f0-9]{8}\.js$/, '.js');
    const mod = await this.parseId(id, { isEntry });

    if (!mod) return;
    if (isEntry) await this.pack();

    const { fake, package: pkg } = mod;
    const mtime = fake ? new Date().toGMTString() : (await lstat(mod.fpath)).mtime.toJSON();
    const bundle = pkg.bundles[mod.file];
    if (!bundle) throw new Error(`unknown bundle ${mod.file} in ${pkg.name}`);
    const result = await bundle.obtain({ loader: isMain  });

    const { code } = await this.writeSourceMap({ bundle, ...result });
    return [code, { 'Last-Modified': mtime }];
  }

  async readMap(id) {
    const fpath = path.join(this.cache.dest, id);
    if (existsSync(fpath)) {
      return this.readFilePath(fpath);
    }
  }

  async readWasm(id) {
    let [, name, version, file] = id.match(rModuleId);
    let pkg;

    if (!version) {
      pkg = this.package;
      name = pkg.name;
      version = pkg.version;
      file = id;
    } else {
      pkg = this.package.find({ name, version });
    }

    const mod = await pkg.parseFile(file);
    const { code } = await mod.obtain();
    const mtime = (await lstat(mod.fpath)).mtime.toJSON();
    return [code, { 'Last-Modified': mtime }];
  }

  async readFile(file, query) {
    await this.ready;

    const { package: pkg } = this;
    const ext = path.extname(file);
    let result = null;

    if (file === 'loader.js') {
      result = await this.readBuiltinJs(file);
    }
    else if (file === 'loaderConfig.json') {
      result = [
        JSON.stringify(Object.assign(pkg.loaderConfig, { lock: pkg.lock })),
        { 'Last-Modified': (new Date()).toGMTString() }
      ];
    }
    else if (await this.isRawFile(file)) {
      result = await this.readRawFile(file);
    }
    else if (ext === '.js') {
      result = await this.readJs(file, query);
    }
    else if (ext === '.css') {
      result = await this.readCss(file, query);
    }
    else if (ext === '.map') {
      result = await this.readMap(file);
    }
    else if (ext === '.wasm') {
      result = await this.readWasm(file);
    }
    else if (rExt.test(ext)) {
      const [fpath] = await pkg.resolve(file);
      if (fpath) {
        result = await this.readFilePath(fpath);
      }
    }

    if (result) {
      result[1] = {
        'Cache-Control': 'max-age=0',
        'Content-Type': mime.lookup(ext),
        ETag: crypto.createHash('md5').update(result[0]).digest('hex'),
        ...result[1]
      };
    }

    return result;
  }

  async destroy() {
    await this.package.destroy();
  }

  func() {
    const Porter_readFile = this.readFile.bind(this);

    return function Porter_func(req, res, next) {
      if (res.headerSent) return next();

      function response(result) {
        if (result) {
          res.statusCode = 200;
          res.set(result[1]);
          if (req.fresh) {
            res.statusCode = 304;
          } else {
            res.write(result[0]);
          }
          res.end();
        } else {
          next();
        }
      }
      Porter_readFile(req.path.slice(1), req.query).then(response).catch(next);
    };
  }

  gen() {
    const Porter_readFile = this.readFile.bind(this);

    return function* Porter_generator(next) {
      const ctx = this;
      if (ctx.headerSent) return yield next;

      const id = ctx.path.slice(1);
      const result = yield Porter_readFile(id, ctx.query);

      if (result) {
        ctx.status = 200;
        ctx.set(result[1]);
        if (ctx.fresh) {
          ctx.status = 304;
        } else {
          ctx.body = result[0];
        }
      } else {
        yield next;
      }
    };
  }

  async() {
    const Porter_readFile = this.readFile.bind(this);

    return async function Porter_async(ctx, next) {
      if (ctx.headerSent) return await next();

      const id = ctx.path.slice(1);
      const result = await Porter_readFile(id, ctx.query);

      if (result) {
        ctx.status = 200;
        ctx.set(result[1]);
        if (ctx.fresh) {
          ctx.status = 304;
        } else {
          ctx.body = result[0];
        }
      } else {
        await next();
      }
    };
  }
}

module.exports = Porter;
