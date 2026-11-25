import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function samePath(left, right) {
  return path.relative(path.resolve(left), path.resolve(right)) === ''
}

function ownDirectory(root, value) {
  const relative = path.relative(root, path.resolve(value))
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Routing directory must stay inside the test root')
  let current = root
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment)
    const stat = fs.lstatSync(current)
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Routing directory must be a plain test-owned directory')
  }
  assert(samePath(fs.realpathSync(value), value), 'Routing directory changed through an alias')
  return path.resolve(value)
}

// Gateway discovery uses a per-OS-user rendezvous as well as HERMES_HOME.
// Pin BOTH, before the Electron entry imports the native main module or any
// plugin. A switch to a named profile inherits these same private directories.
export function pinIsolatedRouting(sandbox, inherited) {
  const root = fs.realpathSync(sandbox.root)
  assert(samePath(path.dirname(root), fs.realpathSync(os.tmpdir())) &&
    /^hermes-e2e-codex-visual-[^/\\]+$/.test(path.basename(root)), 'Expected a fresh visual-test root')
  assert(!fs.lstatSync(sandbox.root).isSymbolicLink(), 'Test root must not be a link')
  const home = ownDirectory(root, sandbox.hermesHome)
  const userData = ownDirectory(root, sandbox.userDataDir)
  assert(samePath(home, path.join(root, 'hermes-home')), 'Unexpected visual-test home')
  const locks = path.join(root, 'gateway-locks')
  const state = path.join(root, 'xdg-state')
  fs.mkdirSync(locks, { recursive: true })
  fs.mkdirSync(state, { recursive: true })
  ownDirectory(root, locks)
  ownDirectory(root, state)
  const fixed = {
    HERMES_HOME: home, HOME: root, USERPROFILE: root,
    HERMES_DESKTOP_USER_DATA_DIR: userData, HERMES_DESKTOP_ISOLATED_BACKEND: '1',
    HERMES_GATEWAY_LOCK_DIR: locks, XDG_STATE_HOME: state,
  }
  const removed = new Set([...Object.keys(fixed), 'HERMES_DESKTOP_REMOTE_URL',
    'HERMES_DESKTOP_REMOTE_TOKEN', 'HERMES_DESKTOP_DEV_SERVER'])
  // Windows environment names are case-insensitive. Remove aliases before
  // spawn rather than leaving two differently cased spellings to Node's sort.
  const env = Object.fromEntries(Object.entries(inherited).filter(([name]) => !removed.has(name.toUpperCase())))
  return { ...env, ...fixed }
}

// This is deliberately the local sidebar journey's contract. Other journeys
// may seed their OWN explicit remote fixture and retain that existing route.
export function assertLocalRoutingInputs(sandbox) {
  const root = fs.realpathSync(sandbox.root)
  ownDirectory(root, sandbox.hermesHome)
  ownDirectory(root, sandbox.userDataDir)
  const profiles = path.join(sandbox.hermesHome, 'profiles')
  ownDirectory(root, profiles)
  for (const name of fs.readdirSync(profiles)) ownDirectory(root, path.join(profiles, name))
  const active = path.join(sandbox.hermesHome, 'active_profile')
  if (fs.existsSync(active)) assert.equal(fs.readFileSync(active, 'utf8').trim(), 'default', 'Unexpected launch profile')
  const v1 = path.join(sandbox.userDataDir, 'connection.json')
  if (fs.existsSync(v1)) {
    assert(!fs.lstatSync(v1).isSymbolicLink(), 'Connection config must not be a link')
    const doc = JSON.parse(fs.readFileSync(v1, 'utf8'))
    assert(!doc.mode || doc.mode === 'local', 'Test must launch locally')
    assert(!doc.remote && !doc.url && !doc.ssh, 'Unexpected remote connection')
    assert(Object.values(doc.profiles || {}).every(value => value?.mode === 'local'), 'Unexpected per-profile route')
  }
  for (const file of [path.join(sandbox.userDataDir, 'connections.json'),
    path.join(sandbox.hermesHome, 'gateway-connections.json')]) {
    if (!fs.existsSync(file)) continue
    assert(!fs.lstatSync(file).isSymbolicLink(), 'Connection registry must not be a link')
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(doc.version, 2)
    assert.equal(doc.primary, 'local')
    assert.equal(doc.connections?.length, 1)
    assert.equal(doc.connections[0]?.id, 'local')
    assert.equal(doc.connections[0]?.kind, 'local')
  }
  // profileBackendParentEnv removes launch-dotenv-owned names on a profile
  // switch. The fixture may declare mock keys, never the isolation contract.
  for (const home of [sandbox.hermesHome, ...fs.readdirSync(profiles).map(name => path.join(profiles, name))]) {
    for (const file of ['.env', '.op.env']) {
      const name = path.join(home, file)
      if (!fs.existsSync(name)) continue
      assert(!fs.lstatSync(name).isSymbolicLink(), 'Test dotenv must not be a link')
      const keys = fs.readFileSync(name, 'utf8').split(/\r?\n/).flatMap(line =>
        line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.slice(1, 2) ?? [])
      assert(keys.every(key => !/^(?:HERMES_|XDG_STATE_HOME$|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$)/i.test(key)),
        'Test dotenv must not override routing')
    }
  }
}

export function assertIsolatedGatewayDescriptor(connection, sandbox, profile) {
  assert.equal(connection.mode, 'local', 'Native descriptor must stay local')
  assert.equal(connection.source, 'local', 'Native descriptor must use the local gateway')
  const endpoint = connection.gatewayEndpoint
  assert(endpoint, 'Native descriptor must identify its gateway')
  const origin = new URL(connection.baseUrl)
  assert(['http:', 'https:'].includes(origin.protocol) && ['127.0.0.1', '[::1]'].includes(origin.hostname) &&
    origin.port && origin.pathname === '/' && !origin.search && !origin.hash && !origin.username && !origin.password,
  'Native descriptor must name a bare loopback origin')
  assert.equal(endpoint.api_origin, origin.origin)
  const expected = profile === 'default' ? sandbox.hermesHome : path.join(sandbox.hermesHome, 'profiles', profile)
  assert(samePath(endpoint.profile_id, expected), 'Gateway endpoint belongs to a different test profile')
  assert(samePath(endpoint.control_home || endpoint.profile_id, sandbox.hermesHome) ||
    samePath(endpoint.control_home || endpoint.profile_id, expected), 'Gateway control belongs to a different root')
  assert.equal(endpoint.runtime_protocol, 1)
  assert(endpoint.instance_id && endpoint.capabilities?.includes('session-authority-v1'), 'Incomplete native gateway identity')
  return { profile, api_origin: origin.origin, profile_id: endpoint.profile_id,
    control_home: endpoint.control_home || endpoint.profile_id, instance_id: endpoint.instance_id }
}
