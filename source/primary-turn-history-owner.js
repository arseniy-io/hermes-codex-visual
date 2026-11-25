// A primary history route is proved by its own SessionView and exact owner.
// Remember a proved route only while the identical surface/view/conversation
// remains mounted and another tile owns focus. Ambient socket state is unused.
const value = atom => { try { return atom?.get?.() } catch { return undefined } }
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null
const pair = owner => text(owner?.connectionId) && text(owner?.profile)
  ? { connectionId: text(owner.connectionId), profile: text(owner.profile) } : null
const samePair = (a, b) => a?.connectionId === b?.connectionId && a?.profile === b?.profile

export function samePrimaryHistoryTarget(a, b) {
  if (a === b) return true
  return Boolean(a && b && a.surface === b.surface && a.view === b.view && a.runtimeId === b.runtimeId &&
    a.sessionId === b.sessionId && a.connectionId === b.connectionId && a.profile === b.profile)
}

export function createPrimaryHistoryTargetReader({ state, readView }) {
  const remembered = new WeakMap()
  return surface => {
    if (!surface?.isConnected) return null
    const native = readView(surface)
    const view = native?.view
    if (view?.kind !== 'primary') return null
    const runtimeId = text(value(view.$runtimeId)), sessionId = text(value(view.$storedId))
    if (!runtimeId || !sessionId) { remembered.delete(view); return null }
    const exactFocus = value(state.focusedSessionId) === runtimeId && value(state.focusedStoredSessionId) === sessionId
    const nativeOwner = pair(native.nativeOwner)
    const focusedOwner = exactFocus ? pair(value(state.focusedSessionOwner)) : null
    if (nativeOwner && focusedOwner && !samePair(nativeOwner, focusedOwner)) {
      remembered.delete(view); return null
    }
    const prior = remembered.get(view)
    const cached = !exactFocus && prior?.surface === surface && prior.runtimeId === runtimeId && prior.sessionId === sessionId
      ? prior : null
    const owner = nativeOwner || focusedOwner || cached
    if (!owner) { remembered.delete(view); return null }
    const target = { surface, view, runtimeId, sessionId, connectionId: owner.connectionId, profile: owner.profile,
      scope: JSON.stringify([owner.connectionId, owner.profile, runtimeId]) }
    remembered.set(view, target)
    return target
  }
}
