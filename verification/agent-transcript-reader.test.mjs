import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { agentSessionMetadata, mergeAgentTranscript } from '../source/agent-transcript-data.js'

const source = fs.readFileSync(new URL('../source/summary-agents.js', import.meta.url), 'utf8')
const hook = source.slice(source.indexOf('function useChildResponse('), source.indexOf('function AgentDetail('))

function fixture({ rows = [], model = 'gpt-6.1-sol', effort = '', status = 'running', metadata,
  available = true, metadataPending = false, paging = true, failOnce = false } = {}) {
  const owner = { parent: 'parent-runtime', profile: 'default', connection: 'local' }
  const requests = []
  const updates = []
  const timers = new Map()
  const observerCallbacks = []
  let nextTimer = 0
  let cleanup
  let resolveMetadata
  let visible = true
  const host = { state: {
    activeSessionId: { get: () => owner.parent }, profile: { get: () => owner.profile },
    connectionId: { get: () => owner.connection },
    focusedSessionId: { get: () => owner.parent }, focusedStoredSessionId: { get: () => 'parent-stored' },
  }, request: async (method, params) => {
    requests.push({ method, params })
    if (failOnce) { failOnce = false; throw new Error('Temporary transport error') }
    return { available, subagent_id: 'worker', child_session_id: 'owned-child', running: status === 'running',
      // Deliberately incomplete compact RPC. The reader must use raw REST,
      // not treat these lossy rows as the child's full command/output log.
      rows: [{ role: 'tool', name: 'terminal', context: 'compact preview' }] }
  } }
  const window = { setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer },
    clearTimeout: id => timers.delete(id), hermesDesktop: { api: async request => {
      const url = new URL(request.path, 'http://fixture')
      requests.push({ ...request, url })
      if (url.pathname.endsWith('/messages')) {
        const offset = Number(url.searchParams.get('offset'))
        const page = rows.slice(offset, offset + 100)
        return { profile: 'default', messages: page,
          ...(paging && { pagination: { order: 'oldest', offset, limit: 100, returned: page.length } }) }
      }
      if (metadataPending) return new Promise(resolve => { resolveMetadata = resolve })
      return metadata || { profile: 'default', model, model_config: JSON.stringify({ reasoning_config: { effort: 'max' } }) }
    } } }
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  const IntersectionObserver = class {
    constructor(callback) { observerCallbacks.push(callback) }
    observe() {}
    disconnect() {}
  }
  const invoke = new Function('useState', 'useEffect', 'host', 'window', 'document', 'IntersectionObserver',
    'mergeAgentTranscript', 'agentSessionMetadata', 'finished', 'normalizeProfile', 'savedResponse', 'agent', 'scope', 'viewport',
    hook + '\nreturn useChildResponse(agent, scope, viewport)')
  invoke(() => [null, snapshot => updates.push(snapshot)], callback => { cleanup = callback() },
    host, window, document, IntersectionObserver, mergeAgentTranscript, agentSessionMetadata,
    agent => ['completed', 'failed', 'interrupted'].includes(agent.status), value => (value || 'default').trim().toLowerCase(),
    value => value.filter(row => row.role === 'assistant' && (row.content || row.text))
      .map(row => ({ text: row.content || row.text, timestamp: row.timestamp })),
    { subagentId: 'worker', childSession: 'native-child', status, model, effort },
    JSON.stringify(['local', 'default', 'parent-runtime']), { current: { checkVisibility: () => visible } })
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)) }
  return { requests, updates, owner, rows, flush,
    get snapshot() { return updates.at(-1) },
    poll() { const next = [...timers.entries()][0]; if (next) { timers.delete(next[0]); return next[1]() } },
    reveal(value = true) { visible = value; for (const callback of observerCallbacks) callback() },
    metadata(value) { resolveMetadata?.(value) }, close() { cleanup?.() } }
}

test('canonical parent proof precedes full paged REST and recovers saved effort for an already known model', async () => {
  const rows = Array.from({ length: 205 }, (_, index) => ({ message_uid: 'row-' + index,
    role: index ? 'assistant' : 'user', content: index ? 'Step ' + index : 'Exact child task' }))
  const f = fixture({ rows })
  try {
    await f.flush()
    assert.equal(f.requests[0].method, 'session.transcript')
    assert.equal(f.requests[0].params.limit, 1)
    assert.equal(f.requests[0].params.session_id, 'parent-stored')
    assert.deepEqual(f.requests.filter(item => item.url?.pathname.endsWith('/messages')).map(item => item.url.searchParams.get('offset')), ['0', '100', '200'])
    assert.equal(f.snapshot.parentSessionId, 'parent-stored', 'Saved changes retain the parent proven by RPC, distinct from the runtime id')
    assert.equal(f.snapshot.rows.length, 205)
    assert.equal(f.snapshot.complete, true)
    assert.equal(f.snapshot.effort, 'max')
    assert.equal(f.snapshot.model, 'gpt-6.1-sol')
    await f.poll(); await f.flush()
    assert.equal(f.requests.filter(item => item.url && !item.url.pathname.endsWith('/messages')).length, 1,
      'Filled metadata is not fetched on each visible poll')
  } finally { f.close() }
})

test('raw tool content and an in-place last row update survive live overlap without duplication', async () => {
  const rows = [{ message_uid: 'task', role: 'user', content: 'Exact task' },
    { message_uid: 'call', role: 'assistant', _tool_call_uids: { reused: 'uid-operation' },
      tool_calls: [{ id: 'reused', function: { name: 'terminal', arguments: '{"command":"echo child"}' } }] },
    { message_uid: 'output', role: 'tool', tool_call_id: 'reused', _tool_call_uid: 'uid-operation', content: 'original output' }]
  const f = fixture({ rows, effort: 'max' })
  try {
    await f.flush()
    rows[2] = { ...rows[2], content: 'updated output' }
    await f.poll(); await f.flush()
    assert.equal(f.snapshot.rows.length, 3)
    assert.equal(f.snapshot.rows[2].content, 'updated output')
    assert.equal(f.snapshot.rows[1]._tool_call_uids.reused, 'uid-operation')
    assert.equal(f.requests.filter(item => item.url?.pathname.endsWith('/messages')).at(-1).url.searchParams.get('offset'), '2')
    assert.equal(f.requests.filter(item => item.url && !item.url.pathname.endsWith('/messages')).length, 0)
  } finally { f.close() }
})

test('unavailable canonical identity cannot open raw child content', async () => {
  const f = fixture({ available: false, rows: [{ role: 'assistant', content: 'Must not read' }] })
  try {
    await f.flush()
    assert.equal(f.requests.filter(item => item.url).length, 0)
    assert.equal(f.snapshot.complete, false)
    assert.equal(f.snapshot.partial, true)
    assert.equal(f.snapshot.rows.length, 0)
  } finally { f.close() }
})

test('a legacy response without proven pagination remains partial', async () => {
  const f = fixture({ rows: [{ message_uid: 'one', role: 'assistant', content: 'One page' }], paging: false })
  try {
    await f.flush()
    assert.equal(f.snapshot.complete, false)
    assert.equal(f.snapshot.partial, true)
  } finally { f.close() }
})

test('a late model metadata result is ignored after owner/profile changes', async () => {
  const f = fixture({ rows: [{ message_uid: 'one', role: 'user', content: 'Task' }], metadataPending: true, model: '' })
  try {
    await f.flush()
    const before = f.updates.length
    f.owner.profile = 'another-owner'
    f.metadata({ profile: 'default', model: 'unowned-model', model_config: { reasoning_config: { effort: 'max' } } })
    await f.flush()
    assert.equal(f.updates.length, before)
    assert.notEqual(f.snapshot.model, 'unowned-model')
  } finally { f.close() }
})

test('a hidden panel performs no live REST reads until revealed', async () => {
  const f = fixture({ rows: [{ message_uid: 'one', role: 'user', content: 'Task' }], effort: 'max' })
  try {
    await f.flush()
    const before = f.requests.length
    f.reveal(false); await f.poll(); await f.flush()
    assert.equal(f.requests.length, before)
    f.reveal(true); await f.flush()
    assert(f.requests.length > before)
  } finally { f.close() }
})

test('replacing the only stored row clears the old transcript', async () => {
  const rows = [{ message_uid: 'before', role: 'user', content: 'Old task' }]
  const f = fixture({ rows, effort: 'max' })
  try {
    await f.flush()
    rows[0] = { message_uid: 'after', role: 'user', content: 'New task' }
    await f.poll()
    await f.flush()
    assert.deepEqual(f.snapshot.rows.map(row => row.message_uid), ['after'])
  } finally { f.close() }
})

test('a temporary read error retries while a completed agent transcript is visible', async () => {
  const f = fixture({ status: 'completed', rows: [{ message_uid: 'saved', role: 'assistant', content: 'Saved reply' }],
    effort: 'max', failOnce: true })
  try {
    await f.flush()
    assert.equal(f.snapshot.partial, true)
    await f.poll()
    await f.flush()
    assert.equal(f.snapshot.complete, true)
    assert.equal(f.snapshot.rows[0].message_uid, 'saved')
    assert.equal(f.requests.filter(request => request.method === 'session.transcript').length, 2)
  } finally { f.close() }
})
