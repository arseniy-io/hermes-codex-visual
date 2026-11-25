import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyTitleRead, createRenameFormController, createSessionRenamer, createUncertainRpcRegistry, MissingStoredSession, readTitleWithRetry, sessionOwnerKey, sessionRowOwner, sessionTabOwner, titleForOpen,
} from '../source/session-rename.js'

const owner = { connectionId: 'local', profile: 'work' }
const snapshot = (revision = 4) => ({
  session_id: 'chat/1', exists: true, runtime_revision: revision, runtime_generation: 2,
})

test('a sidebar row is routed by its own connection, never by another focused chat', () => {
  assert.deepEqual(sessionRowOwner({ id: 'shared', profile: 'default' }, 'local'),
    { connectionId: 'local', profile: 'default' })
  assert.deepEqual(sessionRowOwner({ id: 'shared', profile: 'default', connection_id: 'remote' }, 'local'),
    { connectionId: 'remote', profile: 'default' })
  assert.equal(sessionRowOwner({ id: 'shared', profile: 'default' }, 'remote'), null)
})

test('an actually focused tab can use its captured owner until its row loads', () => {
  const focused = { connectionId: 'remote', profile: 'work' }
  assert.deepEqual(sessionTabOwner(null, 'local', focused, true), focused)
  assert.equal(sessionTabOwner(null, 'local', focused, false), null)
  assert.deepEqual(sessionTabOwner({ profile: 'default' }, 'local', focused, true),
    { connectionId: 'local', profile: 'default' })
})

test('a stale title is never opened before an authoritative read succeeds', async () => {
  assert.equal(await titleForOpen(true, async () => ({ title: 'C' }), 'B'), 'C')
  await assert.rejects(titleForOpen(true, async () => { throw new Error('offline') }, 'B'), /offline/)
  assert.equal(await titleForOpen(false, async () => { throw new Error('unexpected') }, 'B'), 'B')
})

test('a late old read cannot replace the latest title in the sidebar', () => {
  const entry = { title: 'B', readVersion: 2, failed: true }
  assert.equal(applyTitleRead(entry, 2, 'C'), true)
  assert.equal(entry.title, 'C')
  assert.equal(entry.failed, false)
  assert.equal(applyTitleRead(entry, 1, 'B'), false)
  assert.equal(entry.title, 'C')
})

test('displayed titles with equal chat ids remain independent across owners', () => {
  const local = { connectionId: 'local', profile: 'default' }
  const remote = { connectionId: 'remote', profile: 'default' }
  const names = new Map([[sessionOwnerKey(local, 'shared'), 'Локальный']])
  assert.equal(names.get(sessionOwnerKey(remote, 'shared')), undefined)
  names.set(sessionOwnerKey(remote, 'shared'), 'Удалённый')
  names.delete(sessionOwnerKey(local, 'shared'))
  assert.equal(names.get(sessionOwnerKey(remote, 'shared')), 'Удалённый')
})

test('a transient title read is retried with a fixed limit', async () => {
  let attempts = 0
  const waits = []
  const result = await readTitleWithRetry(async () => {
    attempts++
    if (attempts === 1) throw new Error('connection lost')
    return { title: 'Новое название' }
  }, () => true, async ms => { waits.push(ms) })
  assert.equal(result.title, 'Новое название')
  assert.equal(attempts, 2)
  assert.deepEqual(waits, [1000])
  attempts = 0
  await assert.rejects(readTitleWithRetry(async () => { attempts++; throw new Error('offline') }, () => true, async () => {}))
  assert.equal(attempts, 3)
})

test('uses the target owner and the revision fence for a rename', async () => {
  const calls = []
  const rename = createSessionRenamer(async options => {
    calls.push(options)
    return options.method === 'PATCH' ? { ok: true, title: options.body.title } : snapshot()
  }, () => 'request-1')
  assert.deepEqual(await rename(owner, 'chat/1', 'Название'), { ok: true, title: 'Название' })
  assert.deepEqual(calls, [
    { ...owner, path: '/api/sessions/chat%2F1/mutation-snapshot?profile=work' },
    { ...owner, path: '/api/sessions/chat%2F1', method: 'PATCH', body: {
      title: 'Название', request_id: 'request-1', expected_revision: 4, expected_generation: 2, profile: 'work',
    } },
  ])
})

test('a retry after an uncertain write reuses the same identity and snapshot', async () => {
  const calls = []
  let failed = false
  const rename = createSessionRenamer(async options => {
    calls.push(options)
    if (!options.method) return snapshot()
    if (!failed) { failed = true; throw new Error('connection lost') }
    return { ok: true, title: options.body.title }
  }, () => 'same-id')
  await assert.rejects(rename(owner, 'chat/1', 'Имя'), /connection lost/)
  await rename(owner, 'chat/1', 'Имя')
  assert.equal(calls.filter(call => !call.method).length, 1)
  assert.deepEqual(calls[1], calls[2])
})

test('a confirmed conflict is surfaced and a later user attempt reads a fresh revision', async () => {
  const calls = []
  let revision = 3
  let serial = 0
  const rename = createSessionRenamer(async options => {
    calls.push(options)
    if (!options.method) return snapshot(revision++)
    if (options.body.expected_revision === 3) throw new Error('revision_conflict')
    return { ok: true, title: options.body.title }
  }, () => `request-${++serial}`)
  await assert.rejects(rename(owner, 'chat/1', 'Имя'), /revision_conflict/)
  await rename(owner, 'chat/1', 'Имя')
  assert.equal(calls[3].body.expected_revision, 4)
  assert.equal(calls[3].body.request_id, 'request-2')
})

test('identities do not cross owners with the same chat id and title', async () => {
  const calls = []
  let serial = 0
  const rename = createSessionRenamer(async options => {
    calls.push(options)
    if (!options.method) return snapshot(options.profile === 'work' ? 4 : 9)
    if (options.profile === 'work') throw new Error('connection lost')
    return { ok: true }
  }, () => `request-${++serial}`)
  await assert.rejects(rename(owner, 'chat/1', 'Имя'), /connection lost/)
  await rename({ connectionId: 'remote', profile: 'personal' }, 'chat/1', 'Имя')
  assert.equal(calls[3].connectionId, 'remote')
  assert.equal(calls[3].body.profile, 'personal')
  assert.equal(calls[3].body.expected_revision, 9)
  assert.equal(calls[3].body.request_id, 'request-2')
})

test('a profile switch while preparing a rename cannot redirect the write', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const calls = []
  const selected = { connectionId: 'local', profile: 'work' }
  const rename = createSessionRenamer(async options => {
    calls.push(options)
    if (!options.method) { await gate; return snapshot() }
    return { ok: true }
  }, () => 'request-1')
  const operation = rename(selected, 'chat/1', 'Имя')
  selected.profile = 'personal'
  release()
  await operation
  assert.equal(calls[1].profile, 'work')
  assert.equal(calls[1].body.profile, 'work')
})

test('an uncertain live RPC stays blocked when the dialog is closed and reopened', async () => {
  const pending = createUncertainRpcRegistry()
  const writes = []
  const form = () => createRenameFormController('A', {
    unsettled: () => pending.get(owner, 'chat/1'),
    recover: async () => { throw new Error('cannot verify RPC') },
    save: async title => { writes.push(title); pending.mark(owner, 'chat/1', title); throw new Error('connection lost') },
  })
  await assert.rejects(form().submit('B'), /connection lost/)
  await assert.rejects(form().submit('A'), /cannot verify RPC/)
  assert.deepEqual(writes, ['B'])
  assert.equal(pending.get({ connectionId: 'remote', profile: 'work' }, 'chat/1'), null)
  pending.mark(owner, null, 'draft')
  assert.equal(pending.get(owner, null), 'draft')
  assert.equal(pending.get(owner, 'other'), null, 'a failed draft launch cannot lock another saved chat')
})

test('only a proven missing snapshot route permits a legacy backend write', async () => {
  const calls = []
  const rename = createSessionRenamer(async options => {
    calls.push(options)
    if (!options.method) throw new Error('404: No such API endpoint')
    return { ok: true }
  })
  await rename(owner, 'chat/1', 'Имя')
  assert.deepEqual(calls[1].body, { title: 'Имя', profile: 'work' })

  for (const error of ['404: Session not found', 'connection lost']) {
    let writes = 0
    const guarded = createSessionRenamer(async options => {
      if (options.method) writes++
      throw new Error(error)
    })
    await assert.rejects(guarded(owner, 'chat/1', 'Имя'))
    assert.equal(writes, 0)
  }
})

test('an absent or invalid snapshot does not write', async () => {
  for (const value of [
    { session_id: 'chat/1', exists: false, runtime_revision: 0, runtime_generation: null },
    { ...snapshot(), session_id: 'other' },
    { ...snapshot(), runtime_generation: null },
  ]) {
    let writes = 0
    const rename = createSessionRenamer(async options => {
      if (options.method) writes++
      return value
    })
    if (!value.exists) await assert.rejects(rename(owner, 'chat/1', 'Имя'), MissingStoredSession)
    else await assert.rejects(rename(owner, 'chat/1', 'Имя'), /snapshot unavailable/)
    assert.equal(writes, 0)
  }
})

test('a lost acknowledgement is settled before showing the current title or permitting a new write', async () => {
  const state = { title: 'A', revision: 1, loseReply: true, writes: [], receipts: new Map() }
  const rename = createSessionRenamer(async options => {
    if (options.path.includes('/mutation-snapshot')) return snapshot(state.revision)
    if (!options.method) return { title: state.title }
    const body = options.body
    state.writes.push(body)
    if (state.receipts.has(body.request_id)) return state.receipts.get(body.request_id)
    if (body.expected_revision !== state.revision) throw new Error('revision_conflict')
    state.title = body.title
    state.revision++
    const receipt = { ok: true, title: body.title }
    state.receipts.set(body.request_id, receipt)
    if (state.loseReply) { state.loseReply = false; throw new Error('connection lost') }
    return receipt
  }, (() => { let number = 0; return () => `req-${++number}` })())
  const form = () => createRenameFormController('A', {
    save: (title, fence) => rename(owner, 'chat/1', title, fence),
    recover: title => rename.recover(owner, 'chat/1', title),
    unsettled: () => rename.unsettled(owner, 'chat/1'),
  })
  await assert.rejects(form().submit('B'), /connection lost/)
  assert.equal(state.title, 'B')

  // The user reopened the form and wants A. A newer title C has since landed.
  // First replay B with its old identity, then show C without writing A.
  state.title = 'C'
  state.revision++
  const reopened = form()
  assert.deepEqual(await reopened.submit('A'), { review: true, title: 'C' })
  assert.equal(state.title, 'C')
  assert.equal(state.writes.length, 2)
  assert.equal(state.writes[1].request_id, state.writes[0].request_id)

  // A further D after review must conflict, not be overwritten by A.
  state.title = 'D'
  state.revision++
  await assert.rejects(reopened.submit('A'), /revision_conflict/)
  assert.equal(state.title, 'D')
  assert.deepEqual(await reopened.submit('A'), { review: true, title: 'D' })
  assert.deepEqual(await reopened.submit('A'), { review: false })
  assert.equal(state.title, 'A')
})

test('an ambiguous legacy write is not replayed or replaced with another name', async () => {
  let writes = 0
  const rename = createSessionRenamer(async options => {
    if (!options.method) throw new Error('404: No such API endpoint')
    writes++
    throw new Error('connection lost')
  })
  await assert.rejects(rename(owner, 'chat/1', 'B'), /connection lost/)
  await assert.rejects(rename(owner, 'chat/1', 'A'), /reconciliation/)
  await assert.rejects(rename.recover(owner, 'chat/1', 'B'), /cannot be verified safely/)
  assert.equal(writes, 1)
})
