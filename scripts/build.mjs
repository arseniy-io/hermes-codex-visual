import assert from 'node:assert/strict'
import { lstatSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const local = process.argv.includes('--local')
function requireSharedOwner() {
  if (process.argv.includes('--check')) return
  const exists = url => {
    try {
      const info = lstatSync(url)
      assert(!info.isSymbolicLink(), `Coordination path is a link: ${url}`)
      return true
    } catch (error) {
      if (error.code === 'ENOENT') return false
      throw error
    }
  }
  exists(new URL('.local', root))
  const enabled = exists(new URL('.local/release-owner.json', root))
  // A clean public clone retains its Node-only build. An enrolled workspace
  // stays enrolled even while owner is null; errors never disable the guard.
  if (!enabled && !process.env.HCV_RELEASE_OWNER) return
  const result = spawnSync(process.env.HCV_RELEASE_PYTHON || 'python',
    ['-B', fileURLToPath(new URL('scripts/release_lock.py', root)), 'require'],
    { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr || result.error?.message ||
    'Ownership check failed. Set HCV_RELEASE_PYTHON to the local Python executable.')
}
requireSharedOwner()
const destination = new URL(local ? '.local/plugin.js' : 'plugin.js', root)
const assets = JSON.parse(await readFile(new URL('source/visual-assets.json', root), 'utf8'))
{
  const isSvg = value => typeof value === 'string' && value.startsWith('<svg ')
  assert(['newChat', 'plugins', 'folder', 'folderOpen', 'edit', 'messageEdit', 'laptop', 'chatPreviewComputer']
    .every(name => isSvg(assets.icons?.[name])), 'Missing shared workspace icons')
  assert(assets.avatars?.length && assets.avatars.every(pair => pair.length === 2 && pair.every(isSvg)), 'Missing shared avatar pairs')
  assert(['pending', 'done', 'failed', 'disclosure'].every(name => isSvg(assets.install?.[name])), 'Missing shared installer icons')
}
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const version = manifest.version
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
  requireSharedOwner()
  await writeFile(destination, bundle)
  console.log(`Built plugin.js (${Buffer.byteLength(bundle)} bytes).`)
}

// A unified Git installation discovers agent and desktop parts at the
// repository root. The archive still takes the backend from its source tree.
// Keep this opt-in so other in-progress releases retain their packaging.
if (manifest.hermesAgentPackage === true && !local) {
  for (const name of ['plugin.yaml', '__init__.py', 'assistant.py', 'activity.py', 'turn_changes.py', 'timeline.py', 'agent_receipts.py', 'dashboard/manifest.json', 'dashboard/plugin_api.py']) {
    const source = await readFile(new URL(`source/usage-backend/${name}`, root))
    const target = new URL(name, root)
    if (process.argv.includes('--check')) {
      assert.deepEqual(await readFile(target), source, `${name} is out of date. Run npm run build.`)
    } else {
      requireSharedOwner()
      if (name.includes('/')) await mkdir(new URL(name.slice(0, name.lastIndexOf('/') + 1), root), { recursive: true })
      await writeFile(target, source)
    }
  }
}
