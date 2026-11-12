import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export async function bundlePlugin(desktop) {
  const resolveDesktop = createRequire(path.resolve(desktop, 'package.json')).resolve
  const esbuild = resolveDesktop('esbuild')
  const { build } = await import(pathToFileURL(esbuild))
  const source = path.resolve(import.meta.dirname, '../source')
  const { outputFiles } = await build({
    absWorkingDir: source,
    entryPoints: ['plugin.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['@hermes/plugin-sdk', 'react'],
    write: false,
  })
  return outputFiles[0].text
}
