import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../source/subagents.js', import.meta.url), 'utf8')
const helpers = ['tidy', 'profile', 'scopeKey'].map(name => {
  const line = source.split('\n').find(line => line.startsWith('const ' + name + ' ='))
  assert(line, name)
  return line
}).join('\n')
const start = source.indexOf('function nativeWatchOwner(')
const end = source.indexOf('\nfunction useScopedRoster(', start)
assert(start > 0 && end > start)

function fixture(connectionId = 'registry-mini', owner = 'research') {
  const state = { connectionId, owner, parent: 'parent-123' }
  const calls = [], failures = []
  const context = vm.createContext({
    window: { hermesDesktop: { openSessionWindow: (id, opts) => {
      calls.push({ id, opts: { ...opts } })
      return Promise.resolve({ ok: true })
    } } },
    host: { state: {
      activeSessionId: { get: () => state.parent },
      connectionId: { get: () => state.connectionId },
      profile: { get: () => state.owner },
    }, notifyError: (...args) => failures.push(args) },
    language: () => 'ru',
  })
  vm.runInContext(helpers + '\n' + source.slice(start, end) + '\nthis.api = { nativeWatchOwner, nativeActions, openNativeAgent, scopeKey }', context)
  const scope = context.api.scopeKey(state.parent, connectionId, owner)
  return { api: context.api, state, calls, failures, scope }
}

test('canonical child watch pins the captured registry connection and profile', async () => {
  const { api, state, calls, failures, scope } = fixture()
  const agent = { lifecycleChild: true, childSession: 'child-456' }
  assert.equal(JSON.stringify(api.nativeActions(agent, scope)), '["native"]')
  api.openNativeAgent(agent, scope)
  await Promise.resolve()
  assert.deepEqual(calls, [{ id: 'child-456', opts: { connectionId: 'registry-mini', profile: 'research', watch: true } }])
  assert.equal(failures.length, 0)
  state.connectionId = 'other-host'
  api.openNativeAgent(agent, scope)
  assert.equal(calls.length, 1, 'A click after switching connection cannot open the old child')
  state.connectionId = 'registry-mini'
  state.owner = 'other-profile'
  api.openNativeAgent(agent, scope)
  assert.equal(calls.length, 1, 'A click after switching profile cannot open the old child')
  state.owner = 'research'
  state.parent = 'other-parent'
  api.openNativeAgent(agent, scope)
  assert.equal(calls.length, 1, 'A click after switching parent cannot open the old child')
})

test('watch keeps explicit local ownership and canonical child boundaries', () => {
  const { api, calls, scope } = fixture('local', 'default')
  const child = { lifecycleChild: true, childSession: 'child-local' }
  api.openNativeAgent(child, scope)
  assert.deepEqual(calls, [{ id: 'child-local', opts: { connectionId: 'local', profile: 'default', watch: true } }])
  for (const invalid of [{ ...child, lifecycleChild: false }, { ...child, childSession: '' },
    { ...child, childSession: 'parent-123' }]) {
    assert.equal(api.nativeWatchOwner(invalid, scope), null)
    api.openNativeAgent(invalid, scope)
  }
  assert.equal(calls.length, 1)
  assert.equal(api.nativeWatchOwner(child, JSON.stringify([null, 'default', 'parent-123'])), null)
})

test('an existing native button retains the Desktop owner-resolving route', () => {
  const { api, calls, scope } = fixture()
  let clicks = 0
  api.openNativeAgent({ lifecycleChild: true, childSession: 'child-456', canOpen: true,
    button: { isConnected: true, disabled: false, click: () => { clicks += 1 } } }, scope)
  assert.equal(clicks, 1)
  assert.equal(calls.length, 0)
})
