import test from 'node:test'
import assert from 'node:assert/strict'
import { captureDirectoryIdentity, cleanupVisualTest } from './visual-test-cleanup.mjs'

const stats = (overrides = {}) => ({
  dev: 11n, ino: 17451448558377040n, birthtimeNs: 33n,
  isDirectory: () => true, isSymbolicLink: () => false, ...overrides,
})

test('directory identity retains full NTFS identifiers as bigint', () => {
  const options = []
  const fs = { lstatSync(_path, opts) { options.push(opts); return stats() },
    statSync(_path, opts) { options.push(opts); return stats() } }
  assert.deepEqual(captureDirectoryIdentity(fs, 'synthetic'),
    { dev: 11n, ino: 17451448558377040n, birthtimeNs: 33n })
  assert.deepEqual(options, [{ bigint: true }, { bigint: true }])
})

test('unavailable directory identity fails closed', () => {
  for (const overrides of [{ dev: 0n }, { ino: 0n }, { ino: 123 }, { birthtimeNs: undefined }]) {
    const fs = { lstatSync() { return stats() }, statSync() { return stats(overrides) } }
    assert.throws(() => captureDirectoryIdentity(fs, 'synthetic'), /identity is unavailable/)
  }
})

test('a symlink or junction is not treated as a plain directory', () => {
  const fs = { lstatSync() { return stats({ isSymbolicLink: () => true }) } }
  assert.throws(() => captureDirectoryIdentity(fs, 'synthetic'), /not a plain directory/)
})

test('a directory changed between lstat and stat is rejected', () => {
  const fs = { lstatSync() { return stats() }, statSync() { return stats({ ino: 456n }) } }
  assert.throws(() => captureDirectoryIdentity(fs, 'synthetic'), /identity changed while inspecting/)
})

function fixture(overrides = {}) {
  const calls = []
  const mark = name => async () => { calls.push(name) }
  const options = {
    sandboxRoot: 'unique-synthetic-sandbox',
    releases: [['release-one', mark('release-one')], ['release-two', mark('release-two')]],
    hasElectronHandle: true,
    electronLaunchAttempted: true,
    closeApp: mark('app'),
    closeRemoteGateway: mark('remote'),
    stopGateway: mark('gateway'),
    closeMock: mark('mock'),
    closeMcp: mark('mcp'),
    removeSandbox: mark('remove'),
    ...overrides,
  }
  return { calls, options }
}

test('successful cleanup closes all resources and only then removes the profile', async () => {
  const f = fixture()
  await cleanupVisualTest(f.options)
  assert.deepEqual(f.calls, ['release-one', 'release-two', 'app', 'remote', 'gateway', 'mock', 'mcp', 'remove'])
})

test('gateway failure fails the test, retains the profile and still closes servers', async () => {
  const f = fixture({ stopGateway: async () => { throw new Error('synthetic exit 1') } })
  await assert.rejects(cleanupVisualTest(f.options), error => {
    assert(error instanceof AggregateError)
    assert.match(error.message, /profile retained for investigation/)
    assert.match(error.message, /synthetic exit 1/)
    return true
  })
  assert.deepEqual(f.calls, ['release-one', 'release-two', 'app', 'remote', 'mock', 'mcp'])
  assert(!f.calls.includes('remove'))
})

test('an Electron close error preserves the profile and does not stop a still-used gateway', async () => {
  const f = fixture({ closeApp: async () => { throw new Error('close rejected') } })
  await assert.rejects(cleanupVisualTest(f.options), /Local gateway cleanup skipped/)
  assert.deepEqual(f.calls, ['release-one', 'release-two', 'remote', 'mock', 'mcp'])
  assert(!f.calls.includes('gateway'))
  assert(!f.calls.includes('remove'))
})

test('an attempted launch without a returned Electron handle has unknown outcome', async () => {
  const f = fixture({ hasElectronHandle: false, electronLaunchAttempted: true })
  await assert.rejects(cleanupVisualTest(f.options), /launch outcome is unknown/)
  assert.deepEqual(f.calls, ['release-one', 'release-two', 'remote', 'mock', 'mcp'])
})

test('without any launch attempt a handle is not required', async () => {
  const f = fixture({ hasElectronHandle: false, electronLaunchAttempted: false })
  await cleanupVisualTest(f.options)
  assert.deepEqual(f.calls, ['release-one', 'release-two', 'remote', 'gateway', 'mock', 'mcp', 'remove'])
})

test('failed release does not prevent other releases or resource closure', async () => {
  const f = fixture()
  f.options.releases.unshift(['broken release', async () => { throw new Error('cannot release') }])
  await assert.rejects(cleanupVisualTest(f.options), /cannot release/)
  assert.deepEqual(f.calls, ['release-one', 'release-two', 'app', 'remote', 'gateway', 'mock', 'mcp'])
  assert(!f.calls.includes('remove'))
})

test('failed remote gateway close still attempts the local gateway and both servers', async () => {
  const f = fixture({ closeRemoteGateway: async () => { throw new Error('remote close rejected') } })
  await assert.rejects(cleanupVisualTest(f.options), /remote close rejected/)
  assert.deepEqual(f.calls, ['release-one', 'release-two', 'app', 'gateway', 'mock', 'mcp'])
})

test('original test error stays visible when cleanup also fails', async () => {
  const original = new Error('original assertion failed')
  const f = fixture({ hasMainError: true, mainError: original,
    stopGateway: async () => { throw new Error('cleanup refused') } })
  await assert.rejects(cleanupVisualTest(f.options), error => {
    assert(error instanceof AggregateError)
    assert.equal(error.errors[0], original)
    assert.equal(error.cause, original)
    assert.match(error.message, /original assertion failed/)
    assert.match(error.message, /cleanup refused/)
    return true
  })
})

test('successful cleanup does not suppress a main test failure', async () => {
  const original = new Error('original assertion failed')
  const f = fixture({ hasMainError: true, mainError: original })
  async function scenario() {
    try { throw original } finally { await cleanupVisualTest(f.options) }
  }
  await assert.rejects(scenario(), error => error === original)
  assert(f.calls.includes('remove'))
})

test('removal errors fail without claiming the profile is intact', async () => {
  const f = fixture({ removeSandbox: async () => { throw new Error('permission denied') } })
  await assert.rejects(cleanupVisualTest(f.options), error => {
    assert.match(error.message, /profile may be partially removed/)
    assert.match(error.message, /permission denied/)
    return true
  })
})
