import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pinIsolatedRouting, assertLocalRoutingInputs, assertIsolatedGatewayDescriptor } from './isolated-routing.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-e2e-codex-visual-routing-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sandbox = { root, hermesHome: path.join(root, 'hermes-home'), userDataDir: path.join(root, 'electron-user-data') }
  fs.mkdirSync(path.join(sandbox.hermesHome, 'profiles', 'visual-other'), { recursive: true })
  fs.mkdirSync(sandbox.userDataDir)
  fs.writeFileSync(path.join(sandbox.hermesHome, '.env'), 'OPENAI_API_KEY=e2e-mock-key\n')
  return sandbox
}

function descriptor(sandbox, profile = 'default') {
  return { mode: 'local', source: 'local', baseUrl: 'http://127.0.0.1:54321', gatewayEndpoint: {
    api_origin: 'http://127.0.0.1:54321', instance_id: 'own-instance', runtime_protocol: 1,
    profile_id: profile === 'default' ? sandbox.hermesHome : path.join(sandbox.hermesHome, 'profiles', profile),
    control_home: sandbox.hermesHome, capabilities: ['session-authority-v1'],
  } }
}

test('pins rendezvous before launch and drops inherited Windows aliases without changing its input', t => {
  const sandbox = fixture(t)
  const inherited = { XDG_STATE_HOME: 'foreign-state', Hermes_Gateway_Lock_Dir: 'foreign-locks',
    hermes_home: 'foreign-home', HERMES_DESKTOP_REMOTE_URL: 'http://127.0.0.1:1',
    hermes_desktop_remote_token: 'never-log', HERMES_DESKTOP_DEV_SERVER: 'http://127.0.0.1:2', UNRELATED: 'kept' }
  const before = { ...inherited }
  const env = pinIsolatedRouting(sandbox, inherited)
  assert.deepEqual(inherited, before)
  assert.equal(env.HERMES_HOME, sandbox.hermesHome)
  assert.equal(env.HERMES_GATEWAY_LOCK_DIR, path.join(sandbox.root, 'gateway-locks'))
  assert.equal(env.XDG_STATE_HOME, path.join(sandbox.root, 'xdg-state'))
  assert.equal(env.HERMES_DESKTOP_ISOLATED_BACKEND, '1')
  assert.equal(env.UNRELATED, 'kept')
  for (const name of Object.keys(env)) {
    assert(!/remote_url|remote_token|dev_server/i.test(name))
    if (name.toUpperCase() in env) assert.equal(name, name.toUpperCase())
  }
  assertLocalRoutingInputs(sandbox)
})

test('rejects a routing directory outside the fresh test root', t => {
  const sandbox = fixture(t)
  assert.throws(() => pinIsolatedRouting({ ...sandbox, hermesHome: path.dirname(sandbox.root) }, {}), /inside the test root/)
})

test('rejects an existing junction before importing Electron', t => {
  const sandbox = fixture(t)
  fs.symlinkSync(sandbox.hermesHome, path.join(sandbox.root, 'gateway-locks'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => pinIsolatedRouting(sandbox, {}), /plain test-owned directory/)
})

test('accepts the native local-only registry and rejects remote primary or sibling source', t => {
  const sandbox = fixture(t)
  const file = path.join(sandbox.hermesHome, 'gateway-connections.json')
  const registry = { version: 2, primary: 'local', launchMode: 'primary', lastUsed: 'local',
    connections: [{ id: 'local', kind: 'local', label: 'Test' }] }
  fs.writeFileSync(file, JSON.stringify(registry))
  assertLocalRoutingInputs(sandbox)
  fs.writeFileSync(file, JSON.stringify({ ...registry, primary: 'other' }))
  assert.throws(() => assertLocalRoutingInputs(sandbox))
  fs.writeFileSync(file, JSON.stringify({ ...registry, connections: [...registry.connections,
    { id: 'other', kind: 'remote', label: 'Other', url: 'http://127.0.0.1:1' }] }))
  assert.throws(() => assertLocalRoutingInputs(sandbox))
})

test('rejects per-profile remote config and routing variables owned by dotenv', t => {
  const sandbox = fixture(t)
  const file = path.join(sandbox.userDataDir, 'connection.json')
  fs.writeFileSync(file, JSON.stringify({ mode: 'local', profiles: { 'visual-other': { mode: 'remote' } } }))
  assert.throws(() => assertLocalRoutingInputs(sandbox), /per-profile route/)
  fs.unlinkSync(file)
  for (const home of [sandbox.hermesHome, path.join(sandbox.hermesHome, 'profiles', 'visual-other')]) {
    const dotenv = path.join(home, '.env')
    fs.writeFileSync(dotenv, 'HERMES_GATEWAY_LOCK_DIR=foreign\n')
    assert.throws(() => assertLocalRoutingInputs(sandbox), /override routing/)
    fs.writeFileSync(dotenv, 'OPENAI_API_KEY=e2e-mock-key\n')
  }
})

test('accepts both profile identities and never treats one profile as the other', t => {
  const sandbox = fixture(t)
  for (const profile of ['default', 'visual-other']) {
    const result = assertIsolatedGatewayDescriptor(descriptor(sandbox, profile), sandbox, profile)
    assert.equal(result.profile, profile)
    assert.equal(result.control_home, sandbox.hermesHome)
    assert(!('token' in result))
  }
  assert.throws(() => assertIsolatedGatewayDescriptor(descriptor(sandbox), sandbox, 'visual-other'), /different test profile/)
})

test('rejects foreign control home, remote origin, origin mismatch, and incomplete native identity', t => {
  const sandbox = fixture(t)
  const variants = [
    c => { c.gatewayEndpoint.control_home = path.dirname(sandbox.root) },
    c => { c.baseUrl = 'https://example.invalid:443' },
    c => { c.baseUrl = 'http://127.0.0.1:54322' },
    c => { c.gatewayEndpoint.instance_id = '' },
    c => { c.gatewayEndpoint.capabilities = [] },
    c => { c.mode = 'remote' },
  ]
  for (const mutate of variants) {
    const value = descriptor(sandbox)
    mutate(value)
    assert.throws(() => assertIsolatedGatewayDescriptor(value, sandbox, 'default'))
  }
})
