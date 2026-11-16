import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const local = process.argv.includes('--local')
const destination = new URL(local ? '.local/plugin.js' : 'plugin.js', root)
const assets = local
  ? JSON.parse(await readFile(new URL('.local/assets.json', root), 'utf8'))
  : null
if (local) {
  const isSvg = value => typeof value === 'string' && value.startsWith('<svg ')
  assert(['newChat', 'plugins', 'folder', 'folderOpen', 'edit', 'messageEdit', 'laptop', 'chatPreviewComputer']
    .every(name => isSvg(assets.icons?.[name])), 'Missing original local icons')
  assert(assets.avatars?.length && assets.avatars.every(pair => pair.length === 2 && pair.every(isSvg)), 'Missing local avatar pairs')
  assert(['pending', 'done', 'failed', 'disclosure'].every(name => isSvg(assets.install?.[name])), 'Missing local installer icons')
}
const version = local ? JSON.parse(await readFile(new URL('package.json', root), 'utf8')).version : null
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
  define: { HCV_LOCAL_ASSETS: JSON.stringify(assets), HCV_LOCAL_VERSION: JSON.stringify(version) },
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
  console.log(local ? '.local/plugin.js matches the local build.' : 'plugin.js matches the source build.')
} else {
  await writeFile(destination, bundle)
  console.log(`Built plugin.js (${Buffer.byteLength(bundle)} bytes).`)
}
