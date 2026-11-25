import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Exercise the actual changes pane with an isolated in-memory Git API fixture.
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<html lang="ru"><body><main id="app"></main></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
})
const { window } = dom
Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
let fixture
const calls = []
window.hermesDesktop = { api: async options => {
  const url = new URL(options.path, 'http://localhost/')
  calls.push(url.pathname + (url.searchParams.has('staged') ? ':' + url.searchParams.get('staged') : ''))
  if (fixture.nested && url.searchParams.get('path') !== fixture.root) {
    throw new Error('Git paths must be relative to the repository root')
  }
  if (url.pathname === '/api/git/review/list') return { files: [{ path: 'mixed.txt', staged: fixture.staged, added: 2, removed: 0 }] }
  if (url.pathname === '/api/git/file-diff') {
    if (fixture.fail) throw new Error('fixture unavailable')
    return { diff: fixture.combined }
  }
  if (url.pathname === '/api/git/review/diff') return { diff: url.searchParams.get('staged') === 'true' ? fixture.index : fixture.working }
  throw new Error('Unexpected fixture request')
} }
Object.assign(window, { h: React.createElement, useEffect: React.useEffect, useId: React.useId,
  useState: React.useState, useI18n: () => ({ locale: 'ru' }), codexIconStyle: () => ({}), mountStyle: () => {},
  readWorkspaceRepositoryRoot: async cwd => fixture.nested ? fixture.root : cwd })
const source = fs.readFileSync('source/summary-changes.js', 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')
window.eval(source + '\nwindow.TestChanges = ChangesPane')
const root = createRoot(window.document.querySelector('#app'))
let number = 0
async function render(next) {
  fixture = { ...next, root: '/repo-' + ++number }
  calls.length = 0
  await act(async () => {
    const cwd = fixture.nested ? fixture.root + '/subdirectory' : fixture.root
    root.render(React.createElement(window.TestChanges, { cwd, scope: { connectionId: 'local', profile: 'default' } }))
    await Promise.resolve()
  })
  await act(async () => { window.document.querySelector('.hcv-changes-file').click(); await Promise.resolve(); await Promise.resolve() })
  return window.document.querySelector('.hcv-change-detail').textContent
}

try {
  const mixed = await render({ staged: true, combined: '@@\n+staged line\n+unstaged line' })
  assert(mixed.includes('+staged line') && mixed.includes('+unstaged line'))
  assert(!calls.some(call => call.startsWith('/api/git/review/diff:')))

  const cancelled = await render({ staged: true, combined: '', index: '--- a/file\n+++ b/file\n+staged', working: '--- a/file\n+++ b/file\n-staged' })
  assert(cancelled.includes('+staged') && cancelled.includes('-staged'), 'Opposite changes must remain visible')

  const firstCommit = await render({ staged: true, combined: '', index: '--- /dev/null\n+++ b/file\n+initial', working: '--- a/file\n+++ b/file\n+later' })
  assert(firstCommit.includes('+initial') && firstCommit.includes('+later'), 'Both parts of a first commit must remain visible')

  const contentLikeHeader = await render({ staged: true, combined: '', index: '--- a/file\n+++ b/file\n+initial',
    working: '--- a/file\n+++ b/file\n@@ -1 +1 @@\n--- /dev/null\n+replacement' })
  assert(contentLikeHeader.includes('+replacement'), 'File content must not be confused with a synthetic diff header')

  const stagedOnly = await render({ staged: true, combined: '', index: '--- /dev/null\n+++ b/file\n+initial', working: '--- /dev/null\n+++ b/file\n+synthetic duplicate' })
  assert(stagedOnly.includes('+initial') && !stagedOnly.includes('synthetic duplicate'))

  const untracked = await render({ staged: false, combined: '--- /dev/null\n+++ b/file\n+new file' })
  assert(untracked.includes('+new file'))
  const nested = await render({ nested: true, staged: false, combined: '@@ -1 +1 @@\n+from project root' })
  assert(nested.includes('+from project root'), 'Changes must open from a chat inside the repository')
  const failed = await render({ staged: true, fail: true })
  assert.equal(failed, 'Не удалось открыть изменения файла')
  console.log('Combined, cancelled, first-commit, staged-only, new-file and error cases passed.')
} finally {
  await act(async () => root.unmount())
  dom.window.close()
}
