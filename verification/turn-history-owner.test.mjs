import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const body = fs.readFileSync(new URL('../source/turn-history-client.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/export (async )?function /g, '$1function ')
const compile = new Function('host', 'h', 'MessageTextContent', 'window', body +
  ';return { setTurnHistoryContext, requestTurnHistory, readSavedTurnChanges, applySavedTurnChanges }')
const atom = value => ({ get: () => value })
const host = { state: { activeSessionId: atom('primary-runtime'), connectionId: atom('local'), profile: atom('default') } }
function harness(api) {
  const requests = [], disposers = []
  const context = { onDispose: fn => disposers.push(fn), rest: async (...args) => { requests.push(args); return { data: { primary: true } } } }
  const client = compile(host, () => {}, null, { hermesDesktop: { api } })
  client.setTurnHistoryContext(context)
  return { client, requests, disposers }
}

test('tile patch reads use the exact native connection/profile rather than the ambient primary', async () => {
  const calls = []
  const { client, requests } = harness(async request => { calls.push(request); return { data: {
    sessionId: 'tile-stored', parentId: 'tile-stored', scope: 'server-profile-scope', turns: [],
  } } })
  const owner = { scope: 'tile-ui-scope', connectionId: 'vps', profile: 'default', isCurrent: () => true }
  await client.readSavedTurnChanges(owner.scope, 'tile-stored', 'tile-stored', owner)
  assert.equal(requests.length, 0)
  assert.equal(calls[0].connectionId, 'vps')
  assert.equal(calls[0].profile, 'default')
  assert.match(calls[0].path, /^\/api\/plugins\/hermes-codex-visual\/turn-changes\?/)
})

test('a late response after a tile owner changes cannot produce a usable patch result', async () => {
  let resolve, current = true
  const { client } = harness(() => new Promise(done => { resolve = done }))
  const owner = { scope: 'tile-ui-scope', connectionId: 'vps', profile: 'other', isCurrent: () => current }
  const result = client.requestTurnHistory(owner.scope, '/turn-changes', undefined, owner)
  current = false
  resolve({ data: {} })
  await assert.rejects(result, /Chat owner changed/)
})

test('invalid scope and namespace traversal never call the bridge', async () => {
  const { client } = harness(async () => { throw new Error('unexpected RPC') })
  const owner = { scope: 'tile-ui-scope', connectionId: 'vps', profile: 'other', isCurrent: () => true }
  await assert.rejects(client.requestTurnHistory('different-scope', '/turn-changes', undefined, owner), /Chat owner changed/)
  await assert.rejects(client.requestTurnHistory(owner.scope, '/../other', undefined, owner), /Invalid saved-history path/)
})

test('request options cannot override the proven tile owner or plugin namespace', async () => {
  let call
  const { client } = harness(async request => { call = request; return { data: {} } })
  const owner = { scope: 'tile-ui-scope', connectionId: 'vps', profile: 'other', isCurrent: () => true }
  await client.requestTurnHistory(owner.scope, '/turn-changes', { connectionId: 'local', profile: 'default', path: '/api/settings' }, owner)
  assert.equal(call.connectionId, 'vps')
  assert.equal(call.profile, 'other')
  assert.equal(call.path, '/api/plugins/hermes-codex-visual/turn-changes')
})

test('existing primary history calls retain the same namespace-scoped context REST route', async () => {
  const { client, requests } = harness(async () => { throw new Error('unexpected tile RPC') })
  const scope = JSON.stringify(['local', 'default', 'primary-runtime'])
  assert.deepEqual(await client.requestTurnHistory(scope, '/turn-timeline'), { primary: true })
  assert.equal(requests[0][0], '/turn-timeline')
})
