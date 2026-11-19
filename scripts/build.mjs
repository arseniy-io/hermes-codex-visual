import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const local = process.argv.includes('--local')
const destination = new URL(local ? '.local/plugin.js' : 'plugin.js', root)
const assets = JSON.parse(await readFile(new URL('source/visual-assets.json', root), 'utf8'))
{
  const isSvg = value => typeof value === 'string' && value.startsWith('<svg ')
  assert(['newChat', 'plugins', 'folder', 'folderOpen', 'edit', 'messageEdit', 'laptop', 'chatPreviewComputer']
    .every(name => isSvg(assets.icons?.[name])), 'Missing shared workspace icons')
  assert(assets.avatars?.length && assets.avatars.every(pair => pair.length === 2 && pair.every(isSvg)), 'Missing shared avatar pairs')
  assert(['pending', 'done', 'failed', 'disclosure'].every(name => isSvg(assets.install?.[name])), 'Missing shared installer icons')
}
const version = JSON.parse(await readFile(new URL('package.json', root), 'utf8')).version
const license = (await readFile(new URL('LICENSE', root), 'utf8')).trim()
const notices = (await readFile(new URL('THIRD_PARTY_NOTICES.txt', root), 'utf8')).trim()
const { outputFiles, metafile } = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['source/plugin.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['@hermes/plugin-sdk', 'react'],
  banner: { js: `/*! Hermes Codex Visual\n\n${license}\n\nThird-party notices\n\n${notices}\n*/`.replaceAll('\r\n', '\n') },
  // --local changes only the output path. Both variants have the same
  // source, asset import and version, so their modules are byte-identical.
  define: { HCV_LOCAL_VERSION: JSON.stringify(version) },
  write: false,
  metafile: true,
})
assert(Object.hasOwn(metafile.inputs, 'source/visual-assets.json'), 'Shared artwork is missing from the build')
assert(Object.keys(metafile.inputs).every(name => !name.split(/[\\/]/).includes('.local')), 'Build must not import private files')
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
