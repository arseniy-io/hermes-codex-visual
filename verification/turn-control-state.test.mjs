import assert from 'node:assert/strict'
import test from 'node:test'
import { createTurnControl } from '../source/turn-control-state.js'
import { createTurnStopHistory, captureStopAttempt, elapsedTurnSeconds, stoppedPromptRow, stoppedPromptFromHistory } from '../source/turn-stop-history.js'

const target = { connectionId: 'local', profile: 'default', storedId: 'saved-root', runtimeId: 'live-root' }
const receipt = (state, extra = {}) => ({ state, checkpoint_id: 'pause-1',
  root_runtime_id: target.runtimeId, root_stored_id: target.storedId, ...extra })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const make = request => {
  const saved = new Map()
  return { saved, control: createTurnControl({ request, token: () => 'once',
    storage: { get: key => saved.get(key), set: (key, value) => saved.set(key, value) } }) }
}

test('runtime rotation and a new turn never reuse an older stopped receipt', async () => {
  const calls = []
  const { control } = make(async (owner, method) => {
    calls.push([owner.runtimeId, method])
    return receipt('stopped', { root_runtime_id: owner.runtimeId })
  })
  await control.stop(target)
  const rotated = { ...target, runtimeId: 'runtime-B' }
  assert.equal(control.get(rotated), undefined)
  await control.stop(rotated)
  assert.deepEqual(calls, [['live-root', 'session.interrupt'], ['runtime-B', 'session.interrupt']])
  control.invalidate(rotated)
  await control.stop(rotated)
  assert.equal(calls.length, 3)
})

test('one pending full stop handles rapid repeated clicks and keeps the confirmed checkpoint', async () => {
  const wait = deferred(), calls = []
  const { control, saved } = make(async (...args) => { calls.push(args); return wait.promise })
  const first = control.stop(target), second = control.stop(target)
  assert.equal(control.get(target).phase, 'stopping')
  await Promise.resolve()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][2].cascade, true)
  wait.resolve(receipt('stopped'))
  await Promise.all([first, second])
  await control.stop(target)
  assert.equal(calls.length, 1)
  assert.equal(control.get(target).phase, 'stopped')
  assert.deepEqual([...saved.values()], ['pause-1'])
})

test('an ACK, incomplete stop or wrong session is never displayed as stopped', async () => {
  for (const result of [{ ok: true }, receipt('timeout'), receipt('stopped', { root_stored_id: 'neighbor' })]) {
    const { control } = make(async () => result)
    await control.stop(target).catch(() => {})
    assert.equal(control.get(target).phase, 'unknown')
    await assert.rejects(control.resume(target), /No confirmed checkpoint/)
  }
})

test('a checked Stop preserves the original elapsed time and persists it under its own row', async () => {
  const values = new Map()
  const storage = { get: key => values.get(key), set: (key, value) => values.set(key, value) }
  const stops = createTurnStopHistory(storage)
  const control = createTurnControl({
    request: async (_owner, method) => receipt(method === 'session.interrupt' ? 'timeout' : 'stopped'),
    stopped: stops.record, token: () => 'once',
  })
  const attempt = { promptId: 'live-prompt', rowId: 17, seconds: elapsedTurnSeconds(10_000, 271_500) }
  await control.stop(target, attempt)
  assert.equal(stops.read(target, attempt.promptId, 17), undefined)
  await control.refresh(target)
  assert.equal(stops.read(target, attempt.promptId, null).seconds, 261)
  assert.equal(stops.read(target, 'another-prompt', 18), undefined)
  const reopened = createTurnStopHistory(storage)
  assert.equal(reopened.read({ ...target, runtimeId: 'new-runtime' }, 'hydrated-prompt', 17).seconds, 261)
  for (const other of [{ profile: 'another' }, { connectionId: 'remote' }, { storedId: 'neighbor' }]) {
    assert.equal(reopened.read({ ...target, ...other }, 'hydrated-prompt', 17), undefined)
  }
  assert.equal(elapsedTurnSeconds(null, 271_500), null)
  assert.equal(elapsedTurnSeconds(271_500, 10_000), null)
  assert.equal(elapsedTurnSeconds(10_000, 10_020), 0)
  const terminal = { submission_id: 'request', user_row_id: 17, row_ids: [17, 19] }
  assert.equal(stoppedPromptRow(terminal, 'user-request'), 17)
  assert.equal(stoppedPromptRow(terminal, 'user-other'), null)
  assert.equal(stoppedPromptRow({ ...terminal, row_ids: [19] }, 'user-request'), null)
})

test('managed hydration can bind one stored input to its confirmed stop without comparing text', () => {
  const user = (id, rowId) => ({ id, rowId, role: 'user' })
  const predecessor = user('older', 17)
  const live = user('user-live')
  const saved = user('saved', 21)
  const stray = user('other-request')
  const attempt = captureStopAttempt([predecessor, live], live.id, 10_000, 271_500)
  assert.deepEqual(attempt, { promptId: live.id, rowId: undefined, previousRowId: 17,
    startedAtMs: 10_000, requestedAtMs: 271_500, seconds: 261 })
  assert.equal(stoppedPromptFromHistory([predecessor, saved, live], attempt), 21)
  assert.equal(stoppedPromptFromHistory([predecessor, saved, stray], attempt), null)
  const another = user('different', 22)
  const producer = (id, turnStartedAtMs) => ({ id, isHumanUser: true,
    display_metadata: { hcv_timeline: { version: 1, turnId: String(id), phase: 'input', turnStartedAtMs } } })
  assert.equal(stoppedPromptFromHistory([predecessor, saved, another], attempt), null)
  assert.equal(stoppedPromptFromHistory([predecessor, saved, another], attempt,
    [producer(21, 20_000), producer(22, 9_999)]), 21)
  assert.equal(stoppedPromptFromHistory([predecessor, saved, another], attempt,
    [producer(21, 20_000), producer(22, 11_000)]), null)
  assert.equal(stoppedPromptFromHistory([saved], attempt), null)
  assert.equal(stoppedPromptFromHistory([saved], captureStopAttempt([live], live.id, 10_000, 271_500)), 21)
})

test('a late initial status read cannot overwrite a new stop or its in-flight request', async () => {
  const old = deferred(), current = deferred()
  const { control } = make(async (_target, method) => method === 'session.tree_status' ? old.promise : current.promise)
  const reading = control.refresh(target)
  const stopping = control.stop(target)
  await Promise.resolve()
  old.resolve(receipt('none', { checkpoint_id: null }))
  await reading
  assert.equal(control.get(target).phase, 'stopping')
  current.resolve(receipt('stopped'))
  await stopping
  assert.equal(control.get(target).phase, 'stopped')
})

test('continue requires the same owner receipt and one confirmed continuation clears the saved checkpoint', async () => {
  const running = deferred(), calls = []
  const { control, saved } = make(async (_target, method, params) => {
    calls.push({ method, params })
    return method === 'session.interrupt' ? receipt('stopped') : running.promise
  })
  await control.stop(target)
  await assert.rejects(control.resume({ ...target, profile: 'neighbor' }), /No confirmed checkpoint/)
  const first = control.resume(target), second = control.resume(target)
  await Promise.resolve()
  assert.equal(calls.filter(x => x.method === 'session.continue_tree').length, 1)
  running.resolve(receipt('resumed'))
  await Promise.all([first, second])
  assert.equal(control.get(target), undefined)
  assert.deepEqual([...saved.values()], [null])
})

test('continuation failure keeps the checkpoint available and disposal ignores a late status read', async () => {
  const { control, saved } = make(async (_target, method) => {
    if (method === 'session.interrupt') return receipt('stopped')
    throw new Error('offline')
  })
  await control.stop(target)
  await assert.rejects(control.resume(target), /offline/)
  assert.equal(control.get(target).phase, 'unknown')
  assert.deepEqual([...saved.values()], ['pause-1'])
  await assert.rejects(control.resume(target), /No confirmed checkpoint/)
  const late = deferred(), other = make(() => late.promise).control
  const reading = other.refresh(target)
  other.dispose()
  late.resolve(receipt('stopped'))
  await reading
  assert.equal(other.get(target), undefined)
})

test('status can reconcile a stale checkpoint from another window without repeating Stop', async () => {
  const { control, saved } = make(async (_target, method, params) => {
    if (method === 'session.interrupt') return receipt('stopped')
    assert.equal(method, 'session.tree_status')
    if (params.checkpoint_id) throw new Error('stale_tree_checkpoint')
    return receipt('stopped', { checkpoint_id: 'pause-2' })
  })
  await control.stop(target)
  await control.refresh(target)
  assert.equal(control.get(target).checkpoint, 'pause-2')
  assert.deepEqual([...saved.values()], ['pause-2'])
})
