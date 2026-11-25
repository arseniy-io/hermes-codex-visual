import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const filename = '../source/turn-history-client.js'
const source = fs.readFileSync(new URL(filename, import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export (?=(?:async )?function)/gm, '')
function fixture(rest = async () => ({}), ownerApi = async () => ({})) {
  const state = { parent: 'runtime-parent', profile: 'default', connection: 'local' }
  const calls = [], notifications = [], requests = [], disposers = []
  const host = { state: {
    activeSessionId: { get: () => state.parent }, profile: { get: () => state.profile }, connectionId: { get: () => state.connection },
  }, notify: value => notifications.push(value), openWorkspace(id, options) {
    const record = { id, options, closed: false }
    calls.push(record)
    return () => { if (!record.closed) { record.closed = true; options.onClose?.() } }
  } }
  const document = { documentElement: { lang: 'ru' } }
  const h = (type, props, ...children) => ({ type, props, children })
  const api = new Function('host', 'MessageTextContent', 'h', 'document', 'window', source +
    '\nreturn {turnHistoryScope,sameTurnHistoryOwner,setTurnHistoryContext,requestTurnHistory,readTurnTimeline,readSavedTurnChanges,applySavedTurnChanges,openSavedTurnDiff,notifySavedTurnOutcome}')(
    host, () => {}, h, document, { hermesDesktop: { api: ownerApi } })
  const ctx = { rest: async (path, options) => { requests.push([path, options]); return rest(path, options) }, onDispose: callback => disposers.push(callback) }
  api.setTurnHistoryContext(ctx)
  const snapshot = { snapshotId: 'snapshot-fixture', scope: 'profile-store-hash', turnId: 'user-uid', revision: 4,
    unifiedDiff: '--- a/first.txt\n+++ b/first.txt\n@@ -1 +1 @@\n-before\n+after\n',
    files: [{ path: 'first.txt', unifiedDiff: 'first-file-saved-patch' }, { path: 'second.txt', unifiedDiff: 'second-file-saved-patch' }] }
  return { state, calls, notifications, requests, disposers, api, ctx, snapshot, document,
    scope: api.turnHistoryScope(), dispose() { for (const callback of [...disposers]) callback() } }
}

test('profile/connection/chat owner changes reject delayed reads and stale mutation attempts', async () => {
  for (const key of ['parent', 'profile', 'connection']) {
    let release
    const f = fixture(() => new Promise(resolve => { release = resolve }))
    const pending = f.api.requestTurnHistory(f.scope, '/turn-changes')
    f.state[key] = 'another-owner'
    release({ sessionId: 'private-old-chat' })
    await assert.rejects(pending, /owner changed/)
    await assert.rejects(f.api.applySavedTurnChanges(f.scope, 'child', 'stored-parent', f.snapshot, 'undo'), /owner changed/)
    assert.equal(f.requests.length, 1)
    f.dispose()
  }
})

test('a complete timeline fetches only the appended page and replaces rows after a reset', async () => {
  const offsets = []
  const page = (offset, rows, checkpoint, extra = {}) => ({
    sessionId: 'stored', requestedSessionId: 'stored', rows, receipts: [], checkpoint, hasMore: false,
    pagination: { offset, returned: rows.length, scanned: rows.length }, ...extra,
  })
  const results = [
    page(0, [1, 2], 'v1', { hasMore: true, pagination: { offset: 0, returned: 2, scanned: 2, nextOffset: 2 } }),
    page(2, [3], 'v1'),
    page(3, [4], 'v2', { appended: true }),
    page(0, [5, 6], 'new'),
  ]
  const f = fixture(undefined, async request => {
    const query = new URL(request.path, 'http://localhost').searchParams
    assert.equal(query.get('session_id'), 'stored')
    assert.equal(request.connectionId, 'explicit')
    assert.equal(request.profile, 'owned')
    offsets.push([query.get('offset'), query.get('checkpoint')])
    return results.shift()
  })
  const owner = { sessionId: 'stored', scope: f.scope, connectionId: 'explicit', profile: 'owned', isCurrent: () => true }
  const first = await f.api.readTurnTimeline(owner)
  const refresh = await f.api.readTurnTimeline(owner, first)
  const reset = await f.api.readTurnTimeline(owner, refresh)
  assert.deepEqual(first.rows, [1, 2, 3])
  assert.deepEqual(refresh.rows, [1, 2, 3, 4])
  assert.deepEqual(reset.rows, [5, 6])
  assert.deepEqual(offsets, [['0', null], ['2', null], ['3', 'v1'], ['4', 'v2']])
  f.dispose()
})

test('ordinary pagination stops asking for checkpoints when the first page lacks one', async () => {
  const modes = []
  const f = fixture(undefined, async request => {
    const query = new URL(request.path, 'http://localhost').searchParams
    const offset = Number(query.get('offset'))
    modes.push(query.get('incremental'))
    return { sessionId: 'stored', rows: [offset], hasMore: offset < 2,
      pagination: { offset, returned: 1, scanned: 1, nextOffset: offset + 1 } }
  })
  try {
    const owner = { sessionId: 'stored', scope: f.scope, connectionId: 'explicit', profile: 'owned', isCurrent: () => true }
    const full = await f.api.readTurnTimeline(owner)
    assert.deepEqual(full.rows, [0, 1, 2])
    assert.equal(full.checkpoint, null)
    assert.deepEqual(modes, ['true', null, null])
  } finally { f.dispose() }
})

test('POST carries only saved identity and expected revision, never caller patch/cwd or an automatic retry', async () => {
  const f = fixture(async () => { throw new Error('Network outcome unknown') })
  try {
    await assert.rejects(f.api.applySavedTurnChanges(f.scope, 'child', 'stored-parent',
      { ...f.snapshot, cwd: 'must-not-be-sent', patch: 'must-not-be-sent' }, 'undo'), /unknown/)
    assert.equal(f.requests.length, 1)
    const [path, options] = f.requests[0]
    assert.equal(path, '/turn-changes/apply')
    assert.deepEqual(options.body, { scope: 'profile-store-hash', sessionId: 'child', parentId: 'stored-parent',
      snapshotId: 'snapshot-fixture', revision: 4, action: 'undo' })
  } finally { f.dispose() }
})

test('selected saved file opens on the right and owned workspace closes on unload', () => {
  const f = fixture()
  f.api.openSavedTurnDiff(f.scope, f.snapshot, 'second.txt')
  assert.equal(f.calls.length, 1)
  assert.deepEqual(f.calls[0].options.dock, { pane: 'workspace', pos: 'right' })
  const body = f.calls[0].options.render().children[0].props
  assert.equal(body.text, '```diff\nsecond-file-saved-patch\n```')
  assert.equal(body.previewOnly, true)
  f.dispose()
  assert.equal(f.calls[0].closed, true)
  f.api.openSavedTurnDiff(f.scope, f.snapshot)
  assert.equal(f.calls.length, 1)
})

test('a saved patch with many separate backticks preserves exact display without argument-list overflow', () => {
  const f = fixture()
  try {
    const diff = '`a'.repeat(150000)
    assert.doesNotThrow(() => f.api.openSavedTurnDiff(f.scope, { ...f.snapshot, unifiedDiff: diff }))
    assert.equal(f.calls[0].options.render().children[0].props.text, '```diff\n' + diff + '\n```')
  } finally { f.dispose() }
})

test('outcome captions use the active Codex locale, exact fallback and native SDK message field', () => {
  const f = fixture()
  try {
    for (const action of ['undo', 'reapply']) for (const status of ['partial', 'failed', null]) {
      f.api.notifySavedTurnOutcome(status ? { status } : null, action)
    }
    assert.deepEqual(f.notifications.map(item => item.message), [
      'Некоторые изменения отменены', 'Не удалось отменить изменения', 'Не удалось отменить изменения',
      'Некоторые изменения применены повторно', 'Не удалось повторно применить изменения', 'Не удалось повторно применить изменения',
    ])
    assert.ok(f.notifications.every(item => item.kind === 'error'))
    f.api.notifySavedTurnOutcome({ status: 'success' }, 'undo')
    assert.deepEqual(f.notifications[6], {
      id: 'turnDiffPatchAction', kind: 'success', message: 'Changes reverted',
    })
    f.api.notifySavedTurnOutcome({ status: 'success' }, 'reapply')
    assert.deepEqual(f.notifications[7], {
      id: 'turnDiffPatchAction', kind: 'success', message: 'Changes reapplied',
    })
    assert.ok(f.notifications.every(item => typeof item.message === 'string' && !('title' in item)))
  } finally { f.dispose() }
})
