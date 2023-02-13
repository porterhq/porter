import { readFile } from 'fs/promises';
import { MODULE_LOADED } from './constants';
import Module, { TranspileOptions } from './module';

export default class WasmModule extends Module {
  isolated = true;

  async parse() {
    // unnecessary
    this.status = MODULE_LOADED;
  }

  matchImport() {
    return [];
  }

  async load() {
    const { fpath } = this;
    const code = this.code || await readFile(fpath) as unknown as string;
    return { code };
  }

  async transpile({ code }: TranspileOptions) {
    return { code };
  }

  // @ts-ignore
  async minify() {
    return await this.load();
  }
};
