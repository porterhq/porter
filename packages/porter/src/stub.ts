import Debug from 'debug';
import Module, { ModuleOptions } from './module';
import { MODULE_LOADED } from './constants';

const debug = Debug('porter');

export default class Stub extends Module {
  constructor(options: ModuleOptions) {
    super(options);
    debug('unknown file type', options.fpath);
  }

  async parse() {
    this.status = MODULE_LOADED;
  }

  async load() {
    return { code: '' };
  }

  async transpile() {
    return { code: '' };
  }

  async minify() {
    return { code: '' };
  }
};
