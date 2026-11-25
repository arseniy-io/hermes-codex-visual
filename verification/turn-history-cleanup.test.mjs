import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createPrimaryHistoryTargetReader, samePrimaryHistoryTarget } from '../source/primary-turn-history-owner.js'
import { savedTurnCardAnchor, placeSavedTurnCard, savedTurnMutation } from '../source/turn-card-anchor.js'
import { movedElementMatches } from '../source/dom-changes.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const filename = '../source/chat-turn-history.js'
const source = fs.readFileSync(new URL(filename, import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replace(/^export function /gm, 'function ')
const turnMarkup = rowId => `<div data-slot="aui_turn-pair"><div data-slot="aui_user-message-root" data-row-id="${rowId}"></div>
  <div data-slot="aui_response-group"><div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">Synthetic final</div>
    <div data-slot="aui_changed-files">Native saved summary</div><div data-slot="aui_msg-actions"><button>Copy</button></div></div></div></div>`
function fixture() {
  const dom = new JSDOM(`<html lang="ru" data-hermes-theme="codex"><body><div data-chat-surface data-composer-target="main" data-session-anchor="workspace">
  <div data-slot="aui_thread-content">${turnMarkup(1)}</div></div></body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true })
  const w = dom.window, d = w.document
  const network = { turnRows: [1], changes: [1], reads: 0, calls: [], cardOptions: [], held: [], hold: false, nativeOwner: { connectionId: 'remote-primary', profile: 'worker' } }
  const events = new Map(), disposers = []
  const atom = value => { const listeners = new Set(); return { get: () => value, set(next) { value = next; for (const fn of [...listeners]) fn() }, subscribe(fn) { listeners.add(fn); fn(); return () => listeners.delete(fn) }, listen(fn) { listeners.add(fn); return () => listeners.delete(fn) } } }
  const host = { state: { activeSessionId: atom('runtime-parent'), focusedSessionId: atom('runtime-parent'),
    focusedStoredSessionId: atom('stored-parent'), focusedSessionOwner: atom(network.nativeOwner), connectionId: atom('local'), profile: atom('default') } }
  const view = { kind: 'primary', $runtimeId: atom('runtime-parent'), $storedId: atom('stored-parent') }
  const scope = JSON.stringify(['local', 'default', 'runtime-parent'])
  const snapshot = id => ({ turnId: 'prompt-' + id, userRowId: id, snapshotId: 'saved-' + id, revision: 0,
    files: [{ path: `fixture-${id}.txt`, added: 1, removed: 1 }], canApply: true, status: 'ready', nextAction: 'undo' })
  Object.assign(w, {
    host, chatStyles: {}, mountCSS() {}, createPrimaryHistoryTargetReader, samePrimaryHistoryTarget,
    savedTurnCardAnchor, placeSavedTurnCard, savedTurnMutation, movedElementMatches,
    nativeSessionView: () => ({ view, nativeOwner: network.nativeOwner }),
    registerTileTurnHistory: () => ({ current: () => null }),
    matchMedia: query => ({ matches: query.includes(': none'), addEventListener() {}, removeEventListener() {} }),
    nativeRenderedMessageRecord: node => ({ rowId: Number(node.dataset.rowId), runtimeId: 'runtime-parent', storedId: 'stored-parent' }),
    savedTimelineMetadata: () => null,
    timestampSeparatorTimes: descriptions => descriptions.map(() => 1000000000000),
    timestampSeparatorParts: () => ({ label: 'Synthetic date', iso: '2001-09-09T01:46:40.000Z', date: 'Сегодня', join: ', ', time: '12:00' }),
    timestampSeparatorStyles: () => '', turnChangesCardStyles: () => '',
    turnHistoryScope: () => scope, sameTurnHistoryOwner: value => value === scope, setTurnHistoryContext() {},
    readTurnTimeline: async owner => {
      assert(owner?.isCurrent(), 'The primary request must carry a current explicit owner')
      network.calls.push({ method: 'timeline', scope: owner.scope, connectionId: owner.connectionId, profile: owner.profile })
      network.reads++
      const rows = network.turnRows.flatMap(id => [{ row_id: id, isHumanUser: true, timestamp: 1000000000 + id },
        { row_id: id + 1, hasVisibleAssistantText: true }])
      const response = { sessionId: 'stored-parent', requestedSessionId: 'stored-parent', rows, hasMore: false, complete: true }
      return network.hold ? new Promise(resolve => network.held.push(() => resolve(response))) : response
    },
    readSavedTurnChanges: async (scope, sessionId, parentId, owner) => {
      assert(owner?.isCurrent()); network.calls.push({ method: 'snapshots', connectionId: owner.connectionId, profile: owner.profile })
      return { sessionId: 'stored-parent', parentId: 'stored-parent', scope: 'backend-owner', turns: network.changes.map(snapshot) }
    },
    createTurnChangesDom: config => {
      network.cardOptions.push(config)
      const element = d.createElement('div')
      element.setAttribute('data-hcv-saved-turn-card', config.snapshot.turnId)
      element.setAttribute('data-snapshot-id', config.snapshot.snapshotId)
      return { element, update() {}, dispose() { element.remove() } }
    },
    applySavedTurnChanges(...args) { const owner = args.at(-1); network.calls.push({ method: 'apply', connectionId: owner?.connectionId, profile: owner?.profile }) },
    openSavedTurnDiff(...args) { const owner = args.at(-1); network.calls.push({ method: 'diff', connectionId: owner?.connectionId, profile: owner?.profile }) }, notifySavedTurnOutcome() {},
  })
  w.eval(source + '\nwindow.register = registerChatTurnHistory')
  const api = w.register({ onDispose: callback => disposers.push(callback), onEvent: (type, callback) => events.set(type, callback),
    addEventListener: (target, type, callback) => { target.addEventListener(type, callback); disposers.push(() => target.removeEventListener(type, callback)) } }, '[data-hermes-theme="codex"]')
  const flush = async () => { await new Promise(resolve => setTimeout(resolve, 180)); await new Promise(resolve => setTimeout(resolve, 25)) }
  return { w, d, network, api, events, flush, host, view,
    close() { for (const dispose of disposers) dispose(); w.close() } }
}

test('when a saved snapshot disappears, the native card becomes visible again', async () => {
  const f = fixture()
  try {
    await f.flush()
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-turn-card]').length, 1)
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-change-native]').length, 1)
    f.network.changes = []
    f.api.refresh()
    await f.flush()
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-turn-card]').length, 0)
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-change-native]').length, 0)
  } finally { f.close() }
})

test('theme change clears generated UI and returning refreshes turns completed in the stock theme', async () => {
  const f = fixture()
  try {
    await f.flush()
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-turn-card]').length, 1)
    f.d.documentElement.setAttribute('data-hermes-theme', 'nous')
    await f.flush()
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-turn-card]').length, 0)
    assert.equal(f.d.querySelectorAll('[data-hcv-timestamp-separator]').length, 0)
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-change-native]').length, 0)
    f.network.turnRows.push(3)
    f.network.changes.push(3)
    f.d.querySelector('[data-slot="aui_thread-content"]').insertAdjacentHTML('beforeend', turnMarkup(3))
    f.events.get('message.complete')({ session_id: 'runtime-parent' })
    await f.flush()
    const before = f.network.reads
    f.d.documentElement.setAttribute('data-hermes-theme', 'codex')
    await f.flush()
    assert.ok(f.network.reads > before)
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-turn-card]').length, 2)
  } finally { f.close() }
})


test('primary cross-profile timeline, snapshot, diff and apply retain the proved route while a tile owns focus', async () => {
  const f = fixture()
  try {
    await f.flush()
    const options = f.network.cardOptions.at(-1)
    assert(options?.sameOwner())
    f.network.nativeOwner = null
    f.host.state.focusedSessionId.set('tile-runtime')
    f.host.state.focusedStoredSessionId.set('tile-stored')
    f.host.state.focusedSessionOwner.set({ connectionId: 'tile-server', profile: 'tile-profile' })
    await f.flush()
    assert.equal(f.api.current()?.owner.connectionId, 'remote-primary')
    assert(options.sameOwner())
    options.onReview({}, 'fixture.txt')
    options.onApply({}, 'undo')
    assert(f.network.calls.some(call => call.method === 'diff'))
    assert(f.network.calls.some(call => call.method === 'apply'))
    assert(f.network.calls.every(call => call.connectionId === 'remote-primary' && call.profile === 'worker'))
  } finally { f.close() }
})

test('same-ID primary owner replacement clears cards and discards the old delayed timeline', async () => {
  const f = fixture()
  try {
    await f.flush()
    const oldOptions = f.network.cardOptions.at(-1)
    f.network.hold = true
    f.api.refresh()
    await f.flush()
    assert.equal(f.network.held.length, 1)
    f.network.nativeOwner = { connectionId: 'replacement-owner', profile: 'worker' }
    f.host.state.focusedSessionOwner.set(f.network.nativeOwner)
    assert.equal(f.api.current(), null)
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-turn-card]').length, 0)
    assert.equal(oldOptions.sameOwner(), false)
    f.network.hold = false
    await f.flush()
    assert.equal(f.api.current()?.owner.connectionId, 'replacement-owner',
      'opening the replacement must not wait for the previous request')
    f.network.held.shift()()
    await f.flush()
    assert.equal(f.api.current()?.owner.connectionId, 'replacement-owner')
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-turn-card]').length, 1)
    assert(f.network.calls.some(call => call.method === 'snapshots' && call.connectionId === 'replacement-owner'))
  } finally { f.close() }
})

test('primary navigation preserves the tile controller native-summary marker and saved card', async () => {
  const f = fixture()
  try {
    await f.flush()
    const tile = f.d.createElement('div')
    tile.setAttribute('data-chat-surface', '')
    tile.setAttribute('data-composer-target', 'tile:saved-tile')
    tile.setAttribute('data-session-anchor', 'session-tile:saved-tile')
    tile.innerHTML = '<div data-slot="aui_changed-files" data-hcv-saved-change-native></div><div data-hcv-saved-turn-card="tile-card"></div>'
    f.d.body.append(tile)
    f.network.nativeOwner = { connectionId: 'replacement', profile: 'worker' }
    f.host.state.focusedSessionOwner.set(f.network.nativeOwner)
    await f.flush()
    assert.equal(tile.querySelectorAll('[data-hcv-saved-change-native]').length, 1)
    assert.equal(tile.querySelectorAll('[data-hcv-saved-turn-card]').length, 1)
  } finally { f.close() }
})

test('unrelated UI changes and streamed text do not reread history; a new turn does', async () => {
  const f = fixture()
  try {
    await f.flush()
    const before = f.network.reads
    f.d.body.insertAdjacentHTML('beforeend', '<aside><button>Unrelated menu</button></aside>')
    f.d.querySelector('[data-slot="aui_assistant-message-content"]').append(f.d.createElement('span'))
    await f.flush()
    assert.equal(f.network.reads, before)
    f.network.turnRows.push(3)
    f.network.changes.push(3)
    f.d.querySelector('[data-slot="aui_thread-content"]').insertAdjacentHTML('beforeend', turnMarkup(3))
    await f.flush()
    assert.equal(f.network.reads, before + 1)
    assert.equal(f.d.querySelectorAll('[data-hcv-saved-turn-card]').length, 2)
  } finally { f.close() }
})
