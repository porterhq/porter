import path from 'path';
import { fileURLToPath } from 'url';
import sinon from 'sinon';

const pwd = process.cwd();

export const mochaHooks = {
  /**
   * Switch to packages/demo-app to resolve babel presets and plugins correctly
   */
  beforeAll() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(__dirname, '../../demo-app');
    process.chdir(root);
  },
  beforeEach() {
    if (this.sinon) {
      this.sinon.restore();
    } else {
      this.sinon = sinon.createSandbox();
    }
  },
  afterAll() {
    process.chdir(pwd);
  },
};

