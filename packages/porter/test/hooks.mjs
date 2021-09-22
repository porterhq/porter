import path from 'path'
import { fileURLToPath } from 'url'

const pwd = process.cwd()

export const mochaHooks = {
  /**
   * Switch to packages/demo-app to resolve babel presets and plugins correctly
   */
  beforeAll() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const root = path.resolve(__dirname, '../../demo-app')
    process.chdir(root)
  },
  afterAll() {
    process.chdir(pwd)
  }
}
