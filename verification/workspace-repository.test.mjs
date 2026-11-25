import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Only the repository readers are exercised here. The host and React UI are
// supplied by Hermes in the application, so the isolated check stubs them.
const sdk = ['atom', 'Button', 'Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader',
  'DialogTitle', 'host', 'Input', 'TITLEBAR_AREAS', 'useValue']
const react = ['createElement', 'useEffect', 'useRef', 'useState']
const bundled = await build({
  entryPoints: ['source/workspace-actions.js'], bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'fixture-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(?:@hermes\/plugin-sdk|react)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
      contents: (args.path === 'react' ? react : sdk).map(name => `export const ${name} = undefined`).join('\n'),
      loader: 'js',
    }))
  } }],
})
const source = Buffer.from(bundled.outputFiles[0].contents).toString('base64')
const { readWorkspaceRepository, incompleteDiffStats, changesSelectionCwd } = await import('data:text/javascript;base64,' + source)
const sample = { branch: 'main', changed: 1, added: 2, removed: 0,
  files: [{ path: 'new.txt', untracked: true }] }
const local = { connectionId: 'local', profile: 'default' }
const nested = 'C:/fixture/repo/nested'
let probed

globalThis.window = { hermesDesktop: {
  gitRoot: async () => 'C:/fixture/repo',
  git: { repoStatus: async cwd => { probed = cwd; return sample } },
  api: async () => { throw new Error('Unexpected fallback') },
} }
const known = await readWorkspaceRepository(nested, local)
assert.equal(probed, 'C:/fixture/repo')
assert.equal(incompleteDiffStats(known.repo), false)

window.hermesDesktop.gitRoot = async () => { throw new Error('root unavailable') }
const unknown = await readWorkspaceRepository(nested, local)
assert.equal(probed, nested)
assert.equal(unknown.repo.hcvRootUnknown, true)
assert.equal(incompleteDiffStats(unknown.repo), true)

const calls = []
window.hermesDesktop.api = async options => {
  calls.push(options)
  const url = new URL(options.path, 'http://localhost')
  if (url.pathname.endsWith('/workspace-changes')) throw new Error('Companion unavailable')
  if (url.pathname === '/api/fs/git-root') return { root: '/srv/repo' }
  assert.equal(url.pathname, '/api/git/status')
  assert.equal(url.searchParams.get('path'), '/srv/repo')
  return sample
}
const remote = await readWorkspaceRepository('/srv/repo/nested', { connectionId: 'remote-test', profile: 'work' })
assert.equal(incompleteDiffStats(remote.repo), false)
assert(calls.every(call => call.connectionId === 'remote-test' && call.profile === 'work'))

const pending = Promise.withResolvers()
window.hermesDesktop.api = () => pending.promise
const first = readWorkspaceRepository(nested, local)
const second = readWorkspaceRepository(nested, local)
assert.equal(first, second, 'concurrent reads for one connection/profile/folder must be shared')
pending.resolve({ workspace: { path: 'C:/fixture/repo', branch: 'topic', base: 'a'.repeat(40),
  changed: 320, added: 1800, removed: 90, incomplete: false } })
const comparison = await first
assert.equal(comparison.root, 'C:/fixture/repo')
assert.equal(comparison.repo.added, 1800)
assert.equal(comparison.repo.workspaceDiff, true)
assert.equal(incompleteDiffStats(comparison.repo), false, 'The summary must not depend on a capped file listing')
assert(incompleteDiffStats({ ...comparison.repo, incomplete: true }))

assert(incompleteDiffStats({ ...sample, files: [{ path: 'nested/', untracked: true }] }))
assert(incompleteDiffStats({ ...sample, changed: 201, files: Array(200).fill({ path: 'file', untracked: false }) }))

// A click already supplied a verified project and owner. A slow or failed
// reload of that same session must not discard the selected path.
const sessionKey = JSON.stringify(['chat-a', null, 'local', 'default', 'local', 'default', 'open'])
const otherChat = JSON.stringify(['chat-b', null, 'local', 'default', 'local', 'default', 'open'])
const otherProfile = JSON.stringify(['chat-a', null, 'remote', 'work', 'remote', 'work', 'open'])
const selection = { key: sessionKey, cwd: 'C:/fixture/repo', primary: true }
const sessionRead = Promise.withResolvers()
let snapshot = null
const reload = sessionRead.promise.then(row => { snapshot = row }, () => { snapshot = { cwd: '' } })
assert.equal(changesSelectionCwd(selection, sessionKey, snapshot), selection.cwd, 'pending GET must keep the clicked folder')
sessionRead.reject(new Error('session GET timed out'))
await reload
assert.equal(changesSelectionCwd(selection, sessionKey, snapshot), selection.cwd, 'failed GET must keep the clicked folder')
assert.equal(changesSelectionCwd(selection, sessionKey, { cwd: 'C:/fixture/new-root' }), 'C:/fixture/new-root')
assert.equal(changesSelectionCwd(selection, otherChat, null), '', 'another chat must not inherit the folder')
assert.equal(changesSelectionCwd(selection, otherProfile, null), '', 'another connection/profile must not inherit the folder')
assert.equal(changesSelectionCwd({ ...selection, primary: false }, sessionKey, { cwd: 'C:/fixture/new-root' }), selection.cwd)

console.log('Workspace repository checks passed: roots, remote scope, shared reads, incomplete sums and selected folder during failed session reload.')
