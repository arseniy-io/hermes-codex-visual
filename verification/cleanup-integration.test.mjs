import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { captureDirectoryIdentity, cleanupVisualTest } from './visual-test-cleanup.mjs'

// Exercise the actual new finally block with fake resources, not a copy of its logic.
function makeRun(settings = {}) {
  const source = fs.readFileSync(new URL('./sandbox.spec.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const startMarker = '  } finally {\n'
  const start = source.lastIndexOf(startMarker)
  const end = source.indexOf('\n  }\n})', start)
  assert(start > 0 && end > start)
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const names = ['firstToken', 'voiceRequests', 'chatFixture', 'composerFixture', 'mock', 'app',
    'closeTestGateway', 'spawnSync', 'pythonPath', 'path', 'feature', 'sandbox', 'mcp', 'console',
    'cleanupVisualTest', 'hasMainError', 'mainError', 'electronLaunchAttempted', 'fs', 'assert',
    'sandboxRealPath', 'captureDirectoryIdentity', 'sandboxIdentity']
  const run = new AsyncFunction(...names, source.slice(start + startMarker.length, end))
  const calls = []
  let removed = false
  const root = 'synthetic-profile'
  const fakeSandbox = { root, hermesHome: 'synthetic-home', cleanup: () => { calls.push('remove'); removed = !settings.leaveRoot } }
  const sandboxIdentity = { dev: 11n, ino: 22n, birthtimeNs: 33n }
  const fakeFs = {
    realpathSync: () => settings.changedTarget ? 'foreign-target' : root,
    lstatSync: () => {
      if (removed) { const error = new Error('not found'); error.code = 'ENOENT'; throw error }
      return { ...sandboxIdentity, ino: settings.replacedTarget ? 999n : sandboxIdentity.ino,
        birthtimeNs: settings.reusedTarget ? 999n : sandboxIdentity.birthtimeNs,
        isDirectory: () => true, isSymbolicLink: () => false }
    },
  }
  fakeFs.statSync = fakeFs.lstatSync
  const fakeApp = { async close() { calls.push('app'); if (settings.closeError) throw settings.closeError } }
  const fakeMock = { releaseHeldStream() { calls.push('release') }, async close() { calls.push('mock') } }
  const fakeMcp = { close(callback) { calls.push('mcp'); callback() } }
  const fakeSpawn = () => { calls.push('gateway'); return settings.gatewayResult || { status: 0, stdout: 'Stopped finished isolated gateway' } }
  const app = settings.appAbsent ? undefined : fakeApp
  const launchAttempted = settings.launchAttempted !== false
  const args = [undefined, [], undefined, undefined, fakeMock, app, undefined, fakeSpawn, 'fake-python', path,
    'fake-feature', fakeSandbox, fakeMcp, { log() {}, error() {} }, cleanupVisualTest,
    Boolean(settings.originalError), settings.originalError, launchAttempted, fakeFs, assert, root,
    captureDirectoryIdentity, sandboxIdentity]
  return { execute: () => run(...args), calls, get removed() { return removed } }
}

test('actual finally block fails and retains sandbox on gateway helper exit 1', async () => {
  const f = makeRun({ gatewayResult: { status: 1, stderr: 'synthetic stop failed' } })
  await assert.rejects(f.execute(), /synthetic stop failed/)
  assert.deepEqual(f.calls, ['release', 'app', 'gateway', 'mock', 'mcp'])
  assert.equal(f.removed, false)
})

test('actual finally block treats helper timeout as failed cleanup', async () => {
  const f = makeRun({ gatewayResult: { status: null, error: new Error('synthetic timeout') } })
  await assert.rejects(f.execute(), /synthetic timeout/)
  assert.equal(f.removed, false)
  assert(f.calls.includes('mock') && f.calls.includes('mcp'))
})

test('missing gateway record after an Electron launch is unknown and preserves sandbox', async () => {
  const f = makeRun({ gatewayResult: { status: 0, stdout: 'No isolated gateway recorded\r\n' } })
  await assert.rejects(f.execute(), /gateway.*unknown/i)
  assert.equal(f.removed, false)
  assert(f.calls.includes('mock') && f.calls.includes('mcp'))
})

test('missing gateway record with no Electron launch permits ordinary cleanup', async () => {
  const f = makeRun({ appAbsent: true, launchAttempted: false,
    gatewayResult: { status: 0, stdout: 'No isolated gateway recorded\n' } })
  await f.execute()
  assert.deepEqual(f.calls, ['release', 'gateway', 'mock', 'mcp', 'remove'])
  assert.equal(f.removed, true)
})

for (const stdout of ['', 'unexpected helper output', 'Stopped finished isolated gateway\nunexpected extra output']) {
  test(`unrecognised gateway success output preserves sandbox: ${JSON.stringify(stdout)}`, async () => {
    const f = makeRun({ gatewayResult: { status: 0, stdout } })
    await assert.rejects(f.execute(), /gateway.*unknown/i)
    assert.equal(f.removed, false)
    assert(f.calls.includes('mock') && f.calls.includes('mcp'))
  })
}

test('an already stopped, identified gateway permits ordinary cleanup', async () => {
  const f = makeRun({ gatewayResult: { status: 0, stdout: 'Isolated gateway already stopped\n' } })
  await f.execute()
  assert.equal(f.removed, true)
})

test('actual finally block removes the confirmed profile only after success', async () => {
  const f = makeRun()
  await f.execute()
  assert.deepEqual(f.calls, ['release', 'app', 'gateway', 'mock', 'mcp', 'remove'])
  assert.equal(f.removed, true)
})

test('actual finally block refuses a changed target before recursive cleanup', async () => {
  const f = makeRun({ changedTarget: true })
  await assert.rejects(f.execute(), /Isolated test profile changed before cleanup/)
  assert.equal(f.removed, false)
})

test('actual finally block refuses a different directory at the same path', async () => {
  const f = makeRun({ replacedTarget: true })
  await assert.rejects(f.execute(), /identity.*changed/i)
  assert.equal(f.removed, false)
})

test('actual finally block rejects reused inode with different creation time', async () => {
  const f = makeRun({ reusedTarget: true })
  await assert.rejects(f.execute(), /identity.*changed/i)
  assert.equal(f.removed, false)
})

test('actual finally block retains the profile if Electron failed to close', async () => {
  const f = makeRun({ closeError: new Error('Electron close rejected') })
  await assert.rejects(f.execute(), /Electron close rejected/)
  assert(!f.calls.includes('gateway'))
  assert(f.calls.includes('mock') && f.calls.includes('mcp'))
  assert.equal(f.removed, false)
})

test('actual finally block reports the original failure with cleanup failure', async () => {
  const original = new Error('initial test error')
  const f = makeRun({ originalError: original, gatewayResult: { status: 1, stderr: 'gateway failed' } })
  await assert.rejects(f.execute(), error => {
    assert(error instanceof AggregateError)
    assert.equal(error.errors[0], original)
    assert.match(error.message, /initial test error/)
    assert.match(error.message, /gateway failed/)
    return true
  })
  assert.equal(f.removed, false)
})

test('actual finally block checks that swallowed removal errors left no profile', async () => {
  const f = makeRun({ leaveRoot: true })
  await assert.rejects(f.execute(), /Isolated test profile was not fully removed/)
  assert(f.calls.includes('remove'))
  assert.equal(f.removed, false)
})
