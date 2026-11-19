import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const dom = new JSDOM('<html><body><main data-slot="sidebar" data-tour="sessions-sidebar"></main></body></html>', { pretendToBeVisual: true, runScripts: 'outside-only' })
const { window } = dom
Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })
window.version = React.version
const source = fs.readFileSync('source/sidebar-recents.js', 'utf8')
const start = source.indexOf('export function committedFiber(')
const end = source.indexOf('\nfunction groupingAction(', start)
window.eval(source.slice(start, end).replace(/^export function /gm, 'function ') + '\nwindow.nativeWorktreeTarget = nativeWorktreeTarget')
const root = createRoot(document.querySelector('main'))
function NewButton({ project }) { return React.createElement('button', { 'aria-label': 'Новый worktree' },
  React.createElement('span', { className: 'codicon-git-branch' }), project.path) }
function OldButton({ repoPath }) { return React.createElement('button', { 'aria-label': 'Новый worktree' },
  React.createElement('span', { className: 'codicon-git-branch' }), repoPath) }
try {
  await React.act(async () => root.render(React.createElement(NewButton, { project: { path: 'C:/project', connectionId: 'remote', profile: 'other' } })))
  assert.deepEqual({ ...window.nativeWorktreeTarget(document.querySelector('button')) },
    { path: 'C:/project', connectionId: 'remote', profile: 'other' })
  await React.act(async () => root.render(React.createElement(NewButton, { project: { path: 'C:/local' } })))
  assert.deepEqual({ ...window.nativeWorktreeTarget(document.querySelector('button')) },
    { path: 'C:/local', connectionId: undefined, profile: undefined })
  await React.act(async () => root.render(React.createElement(OldButton, { repoPath: 'C:/legacy' })))
  assert.deepEqual({ ...window.nativeWorktreeTarget(document.querySelector('button')) }, { path: 'C:/legacy' })
  assert.equal(window.nativeWorktreeTarget(document.createElement('button')), null)
  const draft = fs.readFileSync('source/draft-setup.js', 'utf8')
  const normalizer = draft.slice(draft.indexOf('function normalized('), draft.indexOf('\nfunction newDraftBar('))
  const selector = draft.slice(draft.indexOf('  const worktreeTrigger ='), draft.indexOf('\n  const newWorktree ='))
  let cwd = 'C:\\project'
  Object.assign(window, {
    CSS: { escape: value => value }, sidebarSelector: '[data-slot="sidebar"][data-tour="sessions-sidebar"]',
    labels: () => ({ nativeWorktree: 'Новый worktree' }),
    host: { state: { cwd: { get: () => cwd }, connectionId: { get: () => 'local' }, profile: { get: () => 'default' } } },
  })
  window.eval(normalizer + '\n' + selector.replace('const worktreeTrigger =', 'window.worktreeTrigger ='))
  const buttons = [
    { path: 'C:/project', connectionId: 'remote', profile: 'default' },
    { path: 'C:/project', connectionId: 'local', profile: 'other' },
    { path: 'C:/project', connectionId: 'local', profile: 'default' },
  ]
  await React.act(async () => root.render(buttons.map((project, key) => React.createElement(NewButton, { project, key }))))
  assert.equal(window.worktreeTrigger(), document.querySelectorAll('button')[2], 'Only the matching gateway and profile may be opened')
  cwd = ''
  assert.equal(window.worktreeTrigger(), undefined, 'A missing folder must never select a project')
  console.log('Current and older Hermes worktree targets and their owners were read correctly.')
} finally {
  await React.act(async () => root.unmount())
  dom.window.close()
}
