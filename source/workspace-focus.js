import { useEffect, useState } from 'react'
import { host, useValue } from '@hermes/plugin-sdk'
import { readFocusedSession } from './sidebar-session-state.js'

// Only a single visible native SessionView with an established owner may drive
// the card. A stale snapshot disappears as soon as the host changes focus.
export function useFocusedWorkspace(markSurface = false) {
  const selected = useValue(host.state.focusedStoredSessionId)
  const runtime = useValue(host.state.focusedSessionId)
  const sdkOwner = useValue(host.state.focusedSessionOwner)
  const [snapshot, setSnapshot] = useState(null)
  useEffect(() => {
    let current = null, stops = [], frame = 0, alive = true
    const schedule = () => { if (alive && !frame) frame = requestAnimationFrame(sync) }
    const detach = () => { for (const stop of stops) stop(); stops = [] }
    function sync() {
      frame = 0
      const next = readFocusedSession({ state: host.state })
      const safe = next?.surface.closest('[inert]') ? null : next
      if (safe?.view !== current?.view) {
        detach()
        if (safe) stops = [safe.view.$storedId, safe.view.$runtimeId, safe.view.$cwd, safe.view.$messagesEmpty]
          .map(store => store.listen(schedule))
      }
      current = safe
      setSnapshot(previous => previous?.view === safe?.view && previous?.surface === safe?.surface &&
        previous?.storedId === safe?.storedId && previous?.runtimeId === safe?.runtimeId &&
        previous?.cwd === safe?.cwd && previous?.empty === safe?.empty &&
        previous?.owner?.connectionId === safe?.owner?.connectionId && previous?.owner?.profile === safe?.owner?.profile
        ? previous : safe)
    }
    const observer = new MutationObserver(records => {
      if (records.some(record => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement
        if (record.type === 'attributes') return target && (target.matches('[data-chat-surface]') || target.querySelector('[data-chat-surface]'))
        return [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element &&
          (node.matches('[data-chat-surface]') || node.querySelector('[data-chat-surface]')))
      })) schedule()
    })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['hidden', 'inert', 'data-pane-hidden'] })
    const storeStops = [host.state.focusedStoredSessionId, host.state.focusedSessionId,
      host.state.focusedSessionOwner, host.state.connectionId, host.state.profile]
      .filter(store => typeof store?.listen === 'function').map(store => store.listen(schedule))
    schedule()
    return () => { alive = false; if (frame) cancelAnimationFrame(frame); observer.disconnect(); detach(); storeStops.forEach(stop => stop()) }
  }, [])
  const current = snapshot && snapshot.storedId === selected && snapshot.runtimeId === runtime &&
    (!sdkOwner || sdkOwner.connectionId === snapshot.owner.connectionId && sdkOwner.profile === snapshot.owner.profile)
    ? snapshot : null
  useEffect(() => {
    if (!markSurface || !current?.surface) return
    const surface = current.surface
    surface.setAttribute('data-hcv-summary-focused', '')
    return () => surface.removeAttribute('data-hcv-summary-focused')
  }, [markSurface, current?.surface])
  return current
}

export function focusedWorkspaceSurface() {
  const focused = readFocusedSession({ state: host.state })
  return focused && !focused.surface.closest('[inert]') ? focused.surface : null
}
