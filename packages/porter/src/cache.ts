import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import Debug from 'debug';
import Packet from './packet';

const debug = Debug('porter');

interface AbstractPorter {
  packet: {
    transpiler: string;
    transpilerVersion: string;
    transpilerOpts: Record<string, any>;
  };
  uglifyOptions?: Record<string, any>;
}

/**
 * Cache transpilation results of module
 */
export default class Cache {
  path: string;
  clean: boolean;
  salt: string = '';
  reloaded: boolean = false;
  version: string = '';

  constructor({ path: cachePath, identifier, clean = false }: { path: string, identifier?: () => string, clean?: boolean }) {
    this.path = cachePath;
    if (typeof identifier === 'function') this.identifier = identifier;
    this.clean = clean;
  }

  identifier(app: AbstractPorter) {
    const { version } = this;
    const { packet } = app;
    const { uglifyOptions } = app;
    const rPorterDir = new RegExp(path.resolve(__dirname, '..'), 'g');
    const result = JSON.stringify({
      version,
      transpiler: {
        name: packet.transpiler,
        version: packet.transpilerVersion,
        options: packet.transpilerOpts,
      },
      uglifyOptions,
    });
    return result.replace(rPorterDir, '<porterDir>');
  }

  digest(source: string) {
    return crypto.createHash('md5').update(this.salt).update(source).digest('hex');
  }

  async get(key: string, source: string) {
    const cachePath = path.join(this.path, `${key}.cache`);
    const cacheContent = await fs.readFile(cachePath, 'utf8').catch(() => '');
    if (!cacheContent) return;

    const relativePath = path.relative(this.path, cachePath);
    let data: Record<string, any> = {};
    try {
      data = JSON.parse(cacheContent);
    } catch (err) {
      console.warn(new Error(`cache broken ${relativePath}`));
    }

    if (data.digest === this.digest(source)) return data;
  }

  async set(key: string, source: string, result: Record<string, any>) {
    const digest = this.digest(source);
    const fpath = path.join(this.path, key);
    await fs.mkdir(path.dirname(fpath), { recursive: true });
    await fs.writeFile(`${fpath}.cache`, JSON.stringify({ ...result, digest }));
  }

  async remove(key: string) {
    await fs.unlink(path.join(this.path, `${key}.cache`)).catch(() => {});
  }

  async prepare({ packet }: AbstractPorter) {
    if (this.clean) await fs.rm(this.path, { recursive: true, force: true });
    const pkg = JSON.parse(await fs.readFile(path.join(__dirname, '../package.json'), 'utf8'));
    this.version = pkg.version;
    this.salt = this.identifier({ packet });
    const saltPath = path.join(this.path, 'salt.cache');
    const salt = await fs.readFile(saltPath, 'utf8').catch(() => '');
    if (!this.clean && salt !== this.salt) {
      if (salt) debug('cache salt changed from %j to %j', salt, this.salt);
      await fs.mkdir(path.dirname(saltPath), { recursive: true });
      await fs.writeFile(saltPath, this.salt);
      // mark cache.reloaded to monitor performance regressions
      this.reloaded = true;
    }
  }
};
