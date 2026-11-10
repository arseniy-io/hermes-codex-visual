import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const destination = new URL('plugin.js', root)
const license = (await readFile(new URL('LICENSE', root), 'utf8')).trim()
const tabler = (await readFile(new URL('THIRD_PARTY_NOTICES.txt', root), 'utf8')).trim()
const { outputFiles, metafile } = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['source/plugin.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['@hermes/plugin-sdk', 'react'],
  banner: { js: `/*! Hermes Codex Visual\n\n${license}\n\nTabler Icons\n\n${tabler}\n*/`.replaceAll('\r\n', '\n') },
  write: false,
  metafile: true,
})
const hermesImports = new Set(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
for (const output of Object.values(metafile.outputs)) {
  for (const dependency of output.imports) {
    assert(dependency.external && hermesImports.has(dependency.path), `Unexpected plugin import: ${dependency.path}`)
  }
}
const bundle = outputFiles[0].text
if (process.argv.includes('--check')) {
  const tracked = (await readFile(destination, 'utf8')).replaceAll('\r\n', '\n')
  assert.equal(tracked, bundle, 'plugin.js is out of date. Run npm run build.')
  console.log('plugin.js matches the source build.')
} else {
  await writeFile(destination, bundle)
  console.log(`Built plugin.js (${Buffer.byteLength(bundle)} bytes).`)
}
