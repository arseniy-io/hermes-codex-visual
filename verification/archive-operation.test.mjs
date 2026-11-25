import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createArchiveOperation, restoreArchivedChat } from '../source/archive-operation.js'
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
test('an undo pressed during archive waits for confirmation and restores once', async () => {
  const pending = deferred(); let calls = 0; const seen = []
  const op = createArchiveOperation({ archive: () => pending.promise, isArchived: async () => true,
    restore: async () => { calls++ }, changed: state => seen.push(state.phase) })
  const first = op.undo(); const second = op.undo()
  assert.equal(calls, 0)
  pending.resolve(); await Promise.all([op.result, first, second])
  assert.equal(calls, 1); assert.equal(op.phase, 'restored')
  assert.deepEqual([...new Set(seen)], ['pending', 'archived', 'restoring', 'restored'])
})
test('an unconfirmed archive never unarchives another or nonexistent chat', async () => {
  let calls = 0
  const op = createArchiveOperation({ archive: async () => {}, isArchived: async () => false,
    restore: async () => { calls++ }, changed: () => {} })
  await assert.rejects(op.result, /not confirmed/); assert.equal(calls, 0); assert.equal(op.phase, 'archive-error')
})
test('a restore after confirmation is performed only once, and errors remain errors', async () => {
  let calls = 0
  const op = createArchiveOperation({ archive: async () => {}, isArchived: async () => true,
    restore: async () => { calls++; throw new Error('refused') }, changed: () => {} })
  await op.result
  await assert.rejects(op.undo(), /refused/); await op.undo()
  assert.equal(calls, 1); assert.equal(op.phase, 'restore-error')
})

test('restoring a pinned chat keeps its original owner and writes its original pin', async () => {
  const calls = []
  const session = { id: 'chat/1', _lineage_root_id: 'root-1', title: 'Chat' }
  const owner = { connectionId: 'remote-a', profile: 'research' }
  const api = async request => { calls.push(request); return request.method ? { ok: true } : { exists: true } }
  await restoreArchivedChat({ session, owner, pinned:true, index:2, api,
    mutate: async (_key, read, send) => { await read(); return send({ request_id:'request-1', expected_revision:7, expected_generation:3 }) },
    currentConnection: () => 'remote-a', untombstone: ids => calls.push(['unhide', ids]),
    restoreRow: row => calls.push(['row', row]), pin: (...args) => calls.push(['pin', ...args]),
    broadcast: () => calls.push(['broadcast']) })
  assert.equal(calls[0].connectionId, 'remote-a')
  assert.match(calls[0].path, /^\/api\/sessions\/chat%2F1\/mutation-snapshot\?profile=research$/)
  assert.deepEqual(calls[1], { ...owner, path:'/api/sessions/chat%2F1', method:'PATCH', body: {
    archived:false, pinned:true, request_id:'request-1', expected_revision:7, expected_generation:3, profile:'research',
  } })
  assert.deepEqual(calls[2], ['unhide', ['chat/1', 'root-1']])
  assert.deepEqual(calls[4], ['pin', 'root-1', true, 2])
})

test('a profile switch still restores the original chat without changing the new connection list', async () => {
  const calls = []
  await restoreArchivedChat({ session:{ id:'same-id' }, owner:{ connectionId:'old', profile:'default' }, pinned:false,
    mutate: async (_key, read, send) => { await read(); return send({ request_id:'r' }) },
    api: async request => { calls.push(request); return request.method ? { ok:true } : {} },
    currentConnection: () => 'new', untombstone: () => assert.fail('wrong list'),
    restoreRow: () => assert.fail('wrong list'), pin: () => assert.fail('wrong list'), broadcast: () => calls.push('broadcast') })
  assert.equal(calls[1].connectionId, 'old')
  assert.equal(calls[1].body.archived, false)
  assert.equal(calls[2], 'broadcast')
})
