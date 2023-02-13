
import path from 'path';
import { rModuleId } from './constants';
import type Packet from './packet';

export default function getFileManager(less: any, packet: Packet) {
  const { FileManager } = less;

  return class CustomFileManager extends FileManager {
    async resolve(specifier = '', context: string) {
      if (specifier.startsWith('/')) return specifier;

      if (specifier.startsWith('./')) return path.join(context, specifier);

      if (specifier.startsWith('~')) {
        const result = await packet.resolve(specifier.slice(1));
        return result[0];
      }

      const fpath = path.join(context, specifier);
      for (const baseDir of packet.paths || [ packet.dir ]) {
        const file = path.relative(baseDir, fpath);
        const result = await packet.resolve(file);
        if (result.length > 0) return result[0];
      }

      const [, name, file ] = specifier.match(rModuleId)!;
      const dep = name && packet.find({ name });
      if (dep) {
        const result = await dep.resolve(file);
        if (result.length > 0) return result[0];
      }

      throw new Error(`unable to solve '${specifier}' (${context})`);
    }

    async loadFile(specifier: string, context: string, options: any, env: any) {
      const fpath = await this.resolve(specifier, context);
      return super.loadFile(fpath, context, options, env);
    }
  };
};
