import os from 'node:os'
import path from 'node:path'

export default {
  testDir: import.meta.dirname,
  testMatch: 'sandbox.spec.mjs',
  outputDir: path.join(os.tmpdir(), `hermes-codex-visual-playwright-${process.pid}`),
  reporter: 'line',
  workers: 1,
  timeout: 160000,
}
