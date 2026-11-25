import { committedFiber } from './sidebar-recents.js'

const atomValue = atom => {
  try { return typeof atom?.get === 'function' ? atom.get() : undefined } catch { return undefined }
}
const ownerPair = owner => typeof owner?.connectionId === 'string' && owner.connectionId &&
  typeof owner?.profile === 'string' && owner.profile
  ? { connectionId: owner.connectionId, profile: owner.profile } : null
const sameOwner = (left, right) => left?.connectionId === right?.connectionId && left?.profile === right?.profile

// SessionView is the same canonical renderer context read by
// source/native-rendered-message.js. This reader never reads transcript text.
export function nativeSessionView(surface, readFiber = committedFiber) {
  const candidates = new Set()
  const add = value => {
    if (!value || !['primary', 'tile'].includes(value.kind)) return
    if (['$storedId', '$runtimeId', '$cwd', '$messagesEmpty'].every(key =>
      typeof value[key]?.get === 'function' && typeof value[key]?.listen === 'function')) candidates.add(value)
  }
  let nativeOwner = null
  for (let fiber = readFiber(surface); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    add(props?.value)
    for (let context = fiber.dependencies?.firstContext; context; context = context.next) add(context.memoizedValue)
    // ChatView props in TileChat carry its resolved credential-free owner.
    // Require both fields; a lone profile never identifies a backend.
    const owner = ownerPair({ connectionId: props?.modelOptionsOwnerConnectionId, profile: props?.modelOptionsProfile })
    if (owner && !nativeOwner) nativeOwner = owner
    else if (owner && !sameOwner(nativeOwner, owner)) return null
  }
  return candidates.size === 1 ? { view: [...candidates][0], nativeOwner } : null
}

// Same source contract as source/session-tabs.js:tabSession. The native
// StatusDot receives the canonical row, including an unlisted owner's stub.
// A missing row is unresolved data, never evidence of a new draft.
export function nativeTabSession(root, storedId, kind, readFiber = committedFiber) {
  if (typeof storedId !== 'string' || !storedId) return null
  const pane = kind === 'tile' ? `session-tile:${storedId}` : 'workspace'
  const sessions = new Set()
  for (const tab of root.querySelectorAll('[role="tab"][data-tree-tab]')) {
    if (tab.getAttribute('data-tree-tab') !== pane) continue
    for (const dot of tab.querySelectorAll('.pane-tab-content span.rounded-full')) {
      for (let fiber = readFiber(dot); fiber; fiber = fiber.return) {
        const props = fiber.memoizedProps
        if (props?.['data-tree-tab']) break
        if (!props || !('storedSessionId' in props) || !('session' in props)) continue
        if (props.storedSessionId === storedId && props.session && typeof props.session === 'object') {
          sessions.add(props.session)
        }
        break
      }
    }
  }
  return sessions.size === 1 ? [...sessions][0] : null
}

export function readFocusedSession({ state, root = document, readFiber = committedFiber }) {
  const focusedId = atomValue(state.focusedStoredSessionId)
  if (focusedId !== null && typeof focusedId !== 'string') return null
  const matches = []
  for (const surface of root.querySelectorAll('[data-chat-surface]')) {
    if (surface.closest('[hidden], [data-pane-hidden]') || !surface.getClientRects().length) continue
    const native = nativeSessionView(surface, readFiber)
    if (!native) continue
    const { view, nativeOwner } = native
    const storedId = atomValue(view.$storedId)
    if (storedId !== focusedId) continue
    const anchor = view.kind === 'primary' ? 'workspace' : `session-tile:${storedId}`
    if (surface.getAttribute('data-session-anchor') !== anchor) continue
    const empty = atomValue(view.$messagesEmpty)
    const cwd = atomValue(view.$cwd)
    if (typeof empty !== 'boolean' || typeof cwd !== 'string') continue
    const session = nativeTabSession(root, storedId, view.kind, readFiber)
    // Native sessionShouldHaveTranscript is message_count > 0. Combining
    // the exact count with SessionView emptiness excludes cold hydration.
    const draft = empty && (view.kind === 'primary' && storedId === null ||
      view.kind === 'tile' && session?.message_count === 0)
    const sdkOwner = ownerPair(atomValue(state.focusedSessionOwner))
    if (sdkOwner && nativeOwner && !sameOwner(sdkOwner, nativeOwner)) continue
    // The ambient owner is authoritative only for an id-less primary draft.
    // Unknown tile ownership fails closed, never borrowing the primary owner.
    const owner = sdkOwner || nativeOwner || (view.kind === 'primary' && storedId === null
      ? ownerPair({ connectionId: atomValue(state.connectionId), profile: atomValue(state.profile) }) : null)
    if (!owner) continue
    matches.push({ surface, view, storedId, runtimeId: atomValue(view.$runtimeId), cwd, empty, draft, session, owner })
  }
  return matches.length === 1 ? matches[0] : null
}

// Call sync() from the existing chrome sync to discover replaced surfaces.
// All native/store subscriptions are rebound on identity changes and removed
// on dispose. The outer caller already owns the DOM mutation observer.
export function attachFocusedDraft({ state, root = document, readFiber = committedFiber, onChange }) {
  let current = null
  let signature
  let stops = []
  let frame = 0
  let disposed = false
  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(() => { frame = 0; sync() })
  }
  const stop = () => { for (const off of stops) off(); stops = [] }
  const storeStops = [state.focusedStoredSessionId, state.focusedSessionOwner, state.connectionId, state.profile]
    .filter(atom => typeof atom?.listen === 'function').map(atom => atom.listen(schedule))
  function sync() {
    if (disposed) return null
    const next = readFocusedSession({ state, root, readFiber })
    if (next?.view !== current?.view) {
      stop()
      if (next) stops = [next.view.$storedId, next.view.$runtimeId, next.view.$cwd, next.view.$messagesEmpty]
        .map(atom => atom.listen(schedule))
    }
    current = next
    const draft = next?.draft ? next : null
    const key = next ? JSON.stringify([
      next.storedId, next.runtimeId, next.draft, next.cwd, next.owner.connectionId, next.owner.profile,
    ]) : null
    if (signature !== key) { signature = key; onChange(draft) }
    return draft
  }
  sync()
  return {
    sync,
    get: () => current?.draft ? current : null,
    dispose() {
      disposed = true
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      stop()
      for (const off of storeStops) off()
      current = null
    },
  }
}

function comparisonPath(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const windows = /^[A-Za-z]:[/\\]/.test(value) || value.startsWith('\\') || value.startsWith('//')
  const path = value.replaceAll('\\', '/').replace(/\/+$/, '') || '/'
  return windows ? path.normalize('NFC').toLowerCase() : path.normalize('NFC')
}

// Explicit project roots and repo roots only. This is directory ownership,
// not label/ID inference. A duplicate best owner/root is deliberately ambiguous.
export function focusedDraftProject(draft, projects, windowOwner) {
  if (!draft?.draft || !draft.owner) return null
  const cwd = comparisonPath(draft.cwd)
  if (!cwd) return null
  let bestLength = -1
  const owners = new Set()
  for (const project of projects) {
    if (project.isNoProject) continue
    // Exactly matches native projectOwnerRoute in gateway-project-rows.ts.
    const owner = project.connectionId
      ? ownerPair({ connectionId: project.connectionId, profile: project.profile || 'default' })
      : ownerPair(windowOwner)
    if (!owner || !sameOwner(owner, draft.owner)) continue
    for (const value of [project.path, ...(project.repos || []).map(repo => repo.path)]) {
      const path = comparisonPath(value)
      if (!path || !(cwd === path || cwd.startsWith(path === '/' ? '/' : `${path}/`))) continue
      if (path.length > bestLength) { bestLength = path.length; owners.clear() }
      if (path.length === bestLength) owners.add(project.id)
    }
  }
  return owners.size === 1 ? [...owners][0] : null
}
