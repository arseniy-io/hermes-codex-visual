import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { agentSessionMetadata, mergeAgentTranscript } from '../source/agent-transcript-data.js'
import { uniqueTileRoute } from '../source/tile-agent-scope.js'

const source = fs.readFileSync(new URL('../source/summary-agents.js', import.meta.url), 'utf8')
const hook = source.slice(source.indexOf('function useChildResponse('), source.indexOf('function AgentDetail('))

function fixture({ routeAvailable = true, delayed = false, duplicate = false } = {}) {
  let current = true, cleanup, resolveRpc
  const calls = [], updates = []
  const host = {
    state: { activeSessionId: { get: () => 'main-runtime' }, connectionId: { get: () => 'main-connection' },
      profile: { get: () => 'main-profile' }, focusedSessionId: { get: () => 'main-runtime' },
      focusedStoredSessionId: { get: () => 'main-stored' } },
    profileRoutes: async () => routeAvailable ? [{ connectionId: 'tile-connection', profile: 'tile-profile', targetProfile: 'server-profile' },
      ...(duplicate ? [{ connectionId: 'tile-connection', profile: 'tile-profile', targetProfile: 'other-server-profile' }] : [])] : [],
    request: () => { throw new Error('Must not use the primary gateway') },
    requestProfile: (route, method, params) => {
      calls.push({ route, method, params })
      if (delayed) return new Promise(resolve => { resolveRpc = resolve })
      return Promise.resolve({ available: true, subagent_id: 'worker', child_session_id: 'own-child', running: false })
    },
  }
  const window = { setTimeout: () => 1, clearTimeout() {}, hermesDesktop: { api: async request => {
    calls.push({ api: request })
    return { profile: 'server-profile', messages: [{ message_uid: '1', role: 'assistant', content: 'right chat' }],
      pagination: { order: 'oldest', offset: 0, limit: 100, returned: 1 } }
  } } }
  const doc = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  const observeWindowVisibility = () => ({ hidden: () => doc.visibilityState === 'hidden', dispose() {} })
  const IntersectionObserver = class { observe() {} disconnect() {} }
  const invoke = new Function('useState', 'useEffect', 'useRef', 'observeWindowVisibility', 'host', 'window', 'IntersectionObserver',
    'mergeAgentTranscript', 'agentSessionMetadata', 'finished', 'normalizeProfile', 'savedResponse', 'uniqueTileRoute', 'tileOwner',
    hook + `\nreturn useChildResponse({subagentId:'worker', status:'completed', model:'model', effort:'max'},
      '["tile-connection","tile-profile","tile-runtime"]', {current:{checkVisibility:()=>true}}, tileOwner, true)`)
  invoke(() => [null, value => updates.push(value)], callback => { cleanup = callback() },
    current => ({ current }), observeWindowVisibility, host, window, IntersectionObserver, mergeAgentTranscript, agentSessionMetadata,
    agent => ['completed','failed','interrupted'].includes(agent.status), value => (value || 'default').trim().toLowerCase(),
    rows => rows.filter(row => row.role === 'assistant').map(row => ({ text: row.content })),
    uniqueTileRoute, { isCurrent: () => current, storedId: 'tile-stored', surface: {}, view: {},
      connectionId: 'tile-connection', profile: 'tile-profile' })
  return { calls, updates, stop() { current = false },
    resolve() { resolveRpc?.({ available: true, subagent_id: 'worker', child_session_id: 'own-child', running: false }) },
    async flush() { for (let i=0; i<5; i++) await new Promise(resolve => setImmediate(resolve)) },
    close() { cleanup?.() } }
}

test('tile child transcript reads its own owner route and saved parent, even when primary differs', async () => {
  const f = fixture()
  try {
    await f.flush()
    assert.equal(f.calls[0].method, 'session.transcript')
    assert.equal(f.calls[0].route.connectionId, 'tile-connection')
    assert.equal(f.calls[0].route.profile, 'tile-profile')
    assert.equal(f.calls[0].params.session_id, 'tile-stored')
    assert.equal(f.calls[0].params.profile, 'server-profile')
    assert.equal(f.calls[1].api.connectionId, 'tile-connection')
    assert.equal(f.calls[1].api.profile, 'tile-profile')
    assert.match(f.calls[1].api.path, /profile=server-profile/)
    assert.equal(f.updates.at(-1).messages[0].text, 'right chat')
  } finally { f.close() }
})

test('a late proof after a tile switch cannot read or publish child content', async () => {
  const f = fixture({ delayed: true })
  try {
    await f.flush(); f.stop(); f.resolve(); await f.flush()
    assert.equal(f.calls.filter(call => call.api).length, 0)
    assert.equal(f.updates.length, 0)
  } finally { f.close() }
})

test('a remote tile without its server-profile mapping fails closed', async () => {
  const f = fixture({ routeAvailable: false })
  try {
    await f.flush()
    assert.equal(f.calls.length, 0)
    assert.equal(f.updates.at(-1).partial, true)
  } finally { f.close() }
})


test('an ambiguous remote tile owner cannot read child content', async () => {
  const f = fixture({ duplicate:true })
  try {
    await f.flush()
    assert.equal(f.calls.length, 0)
    assert.equal(f.updates.at(-1).partial, true)
  } finally { f.close() }
})
