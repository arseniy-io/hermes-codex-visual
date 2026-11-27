import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const input = process.env.HCV_SIDEBAR_STATE_FILE || new URL('../source/sidebar-session-state.js', import.meta.url)
const body = fs.readFileSync(input, 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/export function /g, 'function ')
const load = new Function('committedFiber', 'requestAnimationFrame', 'cancelAnimationFrame', body +
  '; return { nativeSessionView, nativeTabSession, readFocusedSession, attachFocusedDraft, focusedDraftProject }')
const localOwner = { connectionId: 'local', profile: 'default' }
const atom = initial => {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    set(next) { value = next; for (const listener of listeners) listener(next) },
    listen(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    listeners,
  }
}
const context = (value, parent = null) => ({ dependencies: { firstContext: { memoizedValue: value } }, return: parent })
const props = (memoizedProps, parent = null) => ({ memoizedProps, return: parent })

function fixture({ kind = 'tile', storedId = 'saved-1', empty = true, count = 0,
  sdkOwner = localOwner, nativeOwner = localOwner, cwd = '/work/app' } = {}) {
  const fibers = new Map()
  const frames = new Map()
  let frameId = 0
  const api = load(node => fibers.get(node), callback => { const id = ++frameId; frames.set(id, callback); return id },
    id => frames.delete(id))
  const state = {
    focusedStoredSessionId: atom(storedId), focusedSessionOwner: atom(sdkOwner),
    connectionId: atom(localOwner.connectionId), profile: atom(localOwner.profile),
  }
  const view = { kind, $storedId: atom(storedId), $runtimeId: atom('runtime-1'),
    $cwd: atom(cwd), $messagesEmpty: atom(empty) }
  const surface = {
    hidden: false, inert: false, visible: true, paneTree: false, geometryReads: 0,
    closest(selector) {
      if (selector === '[data-tree-group]') return this.paneTree ? {} : null
      return this.hidden || (this.inert && selector.includes('[inert]')) ? {} : null
    },
    getClientRects() {
      this.geometryReads++
      return this.visible ? [{}] : []
    },
    getAttribute: name => name === 'data-session-anchor' ? (kind === 'primary' ? 'workspace' : `session-tile:${storedId}`) : null,
  }
  const ownerProps = nativeOwner ? { modelOptionsOwnerConnectionId: nativeOwner.connectionId,
    modelOptionsProfile: nativeOwner.profile } : {}
  fibers.set(surface, context(view, props(ownerProps)))
  const session = count === undefined ? undefined : { id: storedId, message_count: count }
  const dot = {}
  fibers.set(dot, props({ storedSessionId: storedId, session }, props({ 'data-tree-tab': 'boundary' })))
  const tab = {
    getAttribute: name => name === 'data-tree-tab' ? (kind === 'primary' ? 'workspace' : `session-tile:${storedId}`) : null,
    querySelectorAll: () => [dot],
  }
  const root = {
    surfaces: [surface], tabs: session ? [tab] : [],
    querySelectorAll(selector) { return selector === '[data-chat-surface]' ? this.surfaces : this.tabs },
  }
  const readFiber = node => fibers.get(node)
  const read = () => api.readFocusedSession({ state, root, readFiber })
  const flush = () => {
    const queued = [...frames.values()]
    frames.clear()
    for (const callback of queued) callback()
  }
  return { api, state, view, surface, session, tab, dot, root, fibers, frames, readFiber, read, flush }
}

test('native context requires one real SessionView and one consistent credential-free owner', () => {
  const f = fixture()
  // A provider and dependency pointing at the same object are one context.
  f.fibers.set(f.surface, props({ value: f.view }, context(f.view, props({
    modelOptionsOwnerConnectionId: 'local', modelOptionsProfile: 'default',
  }))))
  assert.equal(f.api.nativeSessionView(f.surface, f.readFiber)?.view, f.view)
  const another = { ...f.view }
  f.fibers.set(f.surface, context(f.view, context(another)))
  assert.equal(f.api.nativeSessionView(f.surface, f.readFiber), null, 'Two distinct contexts are ambiguous')
  f.fibers.set(f.surface, context(f.view, props({ modelOptionsOwnerConnectionId: 'local', modelOptionsProfile: 'default' },
    props({ modelOptionsOwnerConnectionId: 'remote', modelOptionsProfile: 'default' }))))
  assert.equal(f.read(), null, 'Conflicting native owners cannot identify the focused draft')
  f.fibers.set(f.surface, context({ ...f.view, $cwd: { get: () => '/work/app' } }))
  assert.equal(f.read(), null, 'A lookalike without native subscriptions is not a SessionView')
})

test('cold saved transcript hydration stays non-draft while a zero-count new tile is a draft', () => {
  const cold = fixture({ count: 7, empty: true })
  assert.equal(cold.read()?.draft, false, 'An empty renderer cannot turn an existing saved conversation into a new session')
  assert.equal(cold.read()?.session, cold.session)
  const fresh = fixture({ count: 0, empty: true })
  assert.equal(fresh.read()?.draft, true)
  fresh.view.$messagesEmpty.set(false)
  assert.equal(fresh.read()?.draft, false, 'A tile with rendered messages is not a new empty session')
  fresh.view.$messagesEmpty.set(true)
  fresh.root.tabs = []
  assert.equal(fresh.read()?.draft, false, 'A missing canonical tab row is unresolved, not zero messages')
  const duplicateDot = {}
  fresh.fibers.set(duplicateDot, props({ storedSessionId: 'saved-1', session: { message_count: 0 } }))
  fresh.root.tabs = [fresh.tab, { ...fresh.tab, querySelectorAll: () => [duplicateDot] }]
  assert.equal(fresh.read()?.draft, false, 'Conflicting canonical rows also remain unresolved')
})

test('focused ownership never borrows an ambient owner for a tile or accepts a mismatched owner', () => {
  const wrongGateway = fixture({ sdkOwner: { connectionId: 'other', profile: 'default' } })
  assert.equal(wrongGateway.read(), null)
  const wrongProfile = fixture({ sdkOwner: { connectionId: 'local', profile: 'research' } })
  assert.equal(wrongProfile.read(), null)
  const ownerless = fixture({ sdkOwner: null, nativeOwner: null })
  assert.equal(ownerless.read(), null, 'A tile cannot inherit the window connection or profile')
  const primary = fixture({ kind: 'primary', storedId: null, sdkOwner: null, nativeOwner: null })
  assert.equal(primary.read()?.draft, true)
  assert.deepEqual(primary.read()?.owner, localOwner, 'Only an id-less primary draft can use the window owner')
  primary.surface.hidden = true
  assert.equal(primary.read(), null, 'A hidden surface does not become focused')
  primary.surface.hidden = false
  primary.root.surfaces.push({ ...primary.surface })
  primary.fibers.set(primary.root.surfaces[1], primary.fibers.get(primary.surface))
  assert.equal(primary.read(), null, 'Two visible matching surfaces do not guess a focus')
})

test('pane tree visibility resolves focus without reading layout', () => {
  const f = fixture()
  f.surface.paneTree = true
  assert.equal(f.read()?.surface, f.surface)
  f.surface.hidden = true
  assert.equal(f.read(), null, 'Keep-alive panes retain a box when hidden')
  f.surface.hidden = false
  f.surface.inert = true
  assert.equal(f.read(), null, 'A retained chat behind an overlay is inert')
  assert.equal(f.surface.geometryReads, 0)
  f.surface.inert = false
  f.surface.paneTree = false
  f.surface.visible = false
  assert.equal(f.read(), null, 'Outside the pane tree, keep the existing geometry fallback')
  assert.equal(f.surface.geometryReads, 1)
})

test('project selection matches the longest explicit path and its exact backend/profile', () => {
  const f = fixture()
  const draft = { draft: true, cwd: 'C:\\WORK\\App\\nested\\', owner: localOwner }
  const projects = [
    { id: 'root', path: 'c:/work' },
    { id: 'app', path: 'c:/work/app' },
    { id: 'other-backend', path: 'c:/work/app/nested', connectionId: 'other', profile: 'default' },
    { id: 'other-profile', path: 'c:/work/app/nested', connectionId: 'local', profile: 'research' },
    { id: 'home', path: 'c:/work/app/nested', isNoProject: true },
  ]
  assert.equal(f.api.focusedDraftProject(draft, projects, localOwner), 'app')
  const remote = { draft: true, cwd: '/srv/repo/sub', owner: { connectionId: 'remote', profile: 'research' } }
  assert.equal(f.api.focusedDraftProject(remote, [
    { id: 'ambient', path: '/srv/repo' },
    { id: 'remote-repo', path: null, repos: [{ path: '/srv/repo' }], connectionId: 'remote', profile: 'research' },
  ], localOwner), 'remote-repo')
  assert.equal(f.api.focusedDraftProject({ ...draft, draft: false }, projects, localOwner), null)
})

test('ambiguous roots and sibling prefixes cannot select a project and POSIX case is preserved', () => {
  const { api } = fixture()
  const draft = { draft: true, cwd: '/work/app/child', owner: localOwner }
  assert.equal(api.focusedDraftProject(draft, [{ id: 'a', path: '/work/app' }, { id: 'b', path: '/work/app/' }], localOwner), null)
  assert.equal(api.focusedDraftProject({ ...draft, cwd: '/work/apple' }, [{ id: 'app', path: '/work/app' }], localOwner), null)
  assert.equal(api.focusedDraftProject({ ...draft, cwd: '/Work/app' }, [{ id: 'app', path: '/work/app' }], localOwner), null)
  assert.equal(api.focusedDraftProject({ ...draft, cwd: '/work/é/sub' }, [{ id: 'unicode', path: '/work/e\u0301' }], localOwner), 'unicode')
  assert.equal(api.focusedDraftProject({ ...draft, cwd: '' }, [{ id: 'app', path: '/work' }], localOwner), null)
})

test('runtime changes coalesce, replaced views rebind, and disposal removes every subscription and pending frame', () => {
  const f = fixture({ kind: 'primary', storedId: null })
  const calls = []
  const watch = f.api.attachFocusedDraft({ state: f.state, root: f.root, readFiber: f.readFiber, onChange: next => calls.push(next) })
  assert.equal(watch.get()?.draft, true)
  assert.equal(calls.length, 1)
  for (const value of Object.values(f.state)) assert.equal(value.listeners.size, 1)
  for (const key of ['$storedId', '$runtimeId', '$cwd', '$messagesEmpty']) assert.equal(f.view[key].listeners.size, 1)
  f.view.$runtimeId.set('runtime-2')
  f.view.$cwd.set('/work/next')
  assert.equal(f.frames.size, 1, 'Several native changes share one renderer frame')
  f.flush()
  assert.equal(calls.length, 2)
  assert.equal(calls[1].runtimeId, 'runtime-2')
  assert.equal(calls[1].cwd, '/work/next')
  watch.sync()
  assert.equal(calls.length, 2, 'An unchanged snapshot does not repaint')
  const replacement = { ...f.view, $runtimeId: atom('runtime-3'), $cwd: atom('/work/new'),
    $messagesEmpty: atom(true), $storedId: atom(null) }
  f.fibers.set(f.surface, context(replacement))
  watch.sync()
  for (const key of ['$storedId', '$runtimeId', '$cwd', '$messagesEmpty']) {
    assert.equal(f.view[key].listeners.size, 0, 'The old native context is fully detached')
    assert.equal(replacement[key].listeners.size, 1)
  }
  replacement.$messagesEmpty.set(false)
  f.flush()
  assert.equal(watch.get(), null)
  assert.equal(calls.at(-1), null, 'The first real message clears draft selection')
  replacement.$messagesEmpty.set(true)
  assert.equal(f.frames.size, 1)
  const countBeforeDispose = calls.length
  watch.dispose()
  assert.equal(f.frames.size, 0)
  assert.equal(watch.get(), null)
  for (const value of Object.values(f.state)) assert.equal(value.listeners.size, 0)
  for (const key of ['$storedId', '$runtimeId', '$cwd', '$messagesEmpty']) assert.equal(replacement[key].listeners.size, 0)
  f.state.profile.set('after-disposal')
  replacement.$runtimeId.set('runtime-after-disposal')
  f.flush()
  assert.equal(watch.sync(), null)
  assert.equal(calls.length, countBeforeDispose, 'Disposed watchers cannot notify or resubscribe')
})
