import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { composerQueuedEdit } from '../source/composer-native.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const dom = new JSDOM(`<!doctype html><div id="dock" data-composer-target="main">
  <form data-tour="composer"></form><div id="panel"><div class="status-section-body">
    <div data-slot="status-row"><div class="status-row-content"><p>First</p></div><div class="status-row-actions"></div></div>
    <div data-slot="status-row"><div class="status-row-content"><p>Second</p></div><div class="status-row-actions"></div></div>
  </div></div></div>`, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true })
const { window } = dom
window.editing = composerQueuedEdit
const atom = value => ({ get: () => value, listen: () => () => {} })
window.host = { state: {
  focusedSessionId: atom('runtime'), focusedStoredSessionId: atom('stored'), activeSessionId: atom('runtime'),
  focusedSessionOwner: atom({ connectionId: 'local', profile: 'default' }), connectionId: atom('local'),
  profile: atom('default'), busy: atom(true),
} }
const source = fs.readFileSync('source/queue-order.js', 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export function /gm, 'function ')
window.eval(source + '\nwindow.bindQueueOrder = bindQueueOrder')

const dock = window.document.getElementById('dock')
const panel = window.document.getElementById('panel')
const actions = [...panel.querySelectorAll('.status-row-actions')]
const rows = [...panel.querySelectorAll('[data-slot="status-row"]')]
const nativeIds = new Map([[rows[0], 'a'], [rows[1], 'b']])
window.committedFiber = row => ({ return: { key: nativeIds.get(row), memoizedProps: { dismiss: { onDismiss() {} } } } })
const key = 'hermes.desktop.composerQueue.v1'
const entry = (id, text, status) => ({ id, text, attachments: [], ...(status ? { serverStatus: status } : {}) })
const write = entries => window.localStorage.setItem(key, JSON.stringify({ stored: entries }))
const read = () => JSON.parse(window.localStorage.getItem(key)).stored
const binding = window.bindQueueOrder(dock, panel, (name, ...args) => `${name} ${args.join(' ')}`)
const disposeGrip = actions.map(action => binding.add(action))
const grip = panel.querySelector('[data-hcv-queue-grip]')
const moveDown = () => grip.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))

try {
  write([entry('a', 'First'), entry('b', 'Second')])
  binding.sync()
  assert(panel.hasAttribute('data-hcv-queue-reorder'), 'Local queue can still be reordered')
  moveDown()
  assert.deepEqual(read().map(item => item.id), ['b', 'a'], 'Local movement changes the saved order')

  for (const statuses of [['queued', 'queued'], [null, 'queued'], ['unknown', null]]) {
    write([entry('a', 'First', statuses[0]), entry('b', 'Second', statuses[1])])
    binding.sync()
    assert(!panel.hasAttribute('data-hcv-queue-reorder'), 'Server-owned or mixed queue must not offer local reorder')
    const before = window.localStorage.getItem(key)
    moveDown()
    assert.equal(window.localStorage.getItem(key), before, 'Keyboard movement must not change a server-owned queue')
  }
  for (const row of rows) row.querySelector('p').textContent = 'Same caption'
  write([entry('b', 'Same caption'), entry('a', 'Same caption')])
  binding.sync()
  assert(!panel.hasAttribute('data-hcv-queue-reorder'), 'the old rendered order cannot act on the new queue')
  moveDown()
  assert.deepEqual(read().map(item => item.id), ['b', 'a'])
  nativeIds.set(rows[0], 'b')
  nativeIds.set(rows[1], 'a')
  binding.sync()
  assert(panel.hasAttribute('data-hcv-queue-reorder'), 'the committed native order makes the two entries distinguishable')
  moveDown()
  assert.deepEqual(read().map(item => item.id), ['a', 'b'])
  console.log('Local queues reorder; stale rows and server-owned queues refuse local reordering.')
} finally {
  disposeGrip.forEach(dispose => dispose())
  binding.dispose()
  dom.window.close()
}
