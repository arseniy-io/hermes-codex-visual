import { host } from '@hermes/plugin-sdk'
import { nativeSessionView } from './sidebar-session-state.js'
import { nativeRenderedMessageRecord } from './native-rendered-message.js'
import { createTurnChangesCard } from './turn-changes-dom.js'
import { readTurnTimeline, readSavedTurnChanges, applySavedTurnChanges, openSavedTurnDiff, notifySavedTurnOutcome } from './turn-history-client.js'
import { savedTurnCardAnchor, placeSavedTurnCard, savedTurnMutation } from './turn-card-anchor.js'
import { movedElementMatches } from './dom-changes.js'

const surfaceSelector = '[data-chat-surface][data-composer-target^="tile:"][data-session-anchor^="session-tile:"]'
const pair = '[data-slot="aui_turn-pair"]'
const user = '[data-slot="aui_user-message-root"]'
const generated = '[data-hcv-turn-history-generated]'
const normalize = value => typeof value === 'string' && value.trim() ? value.trim() : null

export function tileTurnHistoryTarget(surface) {
  const native = nativeSessionView(surface)
  if (!native || native.view.kind !== 'tile') return null
  const runtimeId = normalize(native.view.$runtimeId.get())
  const storedId = normalize(native.view.$storedId.get())
  const connectionId = normalize(native.nativeOwner?.connectionId)
  const profile = normalize(native.nativeOwner?.profile)
  if (!storedId || !connectionId || !profile || surface.dataset.sessionAnchor !== `session-tile:${storedId}`) return null
  return { surface, view: native.view, runtimeId, sessionId: storedId, connectionId, profile,
    scope: JSON.stringify([connectionId, profile, runtimeId || storedId]) }
}

// Main's existing history/roster contract remains unchanged. Each mounted tile
// has its own source identity and route, even when another pane owns focus.
export function registerTileTurnHistory(ctx, active, onChange = () => {}) {
  const controllers = new Map()
  const contrast = matchMedia('(forced-colors: none)')
  let disposed = false, frame = 0
  const enabled = () => !disposed && contrast.matches && document.documentElement.matches(active)
  const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(() => { frame = 0; sync() }) }

  function attach(target) {
    const { surface } = target
    const cards = new Map()
    let alive = true, history = null, changes = null, timer, reading = false, reload = false
    const current = () => {
      const next = tileTurnHistoryTarget(surface)
      return alive && enabled() && surface.isConnected && next?.view === target.view &&
        next.scope === target.scope && next.sessionId === target.sessionId
    }
    const owner = { ...target, isCurrent: current }
    const clear = () => {
      for (const card of cards.values()) card.dispose()
      cards.clear()
      surface.querySelectorAll('[data-hcv-saved-change-native]').forEach(node => node.removeAttribute('data-hcv-saved-change-native'))
    }
    function paint() {
      if (!current()) { clear(); return }
      const saved = new Map((changes?.turns || []).map(snapshot => [snapshot.userRowId, snapshot]))
      const present = new Set()
      const lang = document.documentElement.lang.startsWith('ru') ? 'ru' : 'en'
      for (const turn of surface.querySelectorAll(pair)) {
        const prompt = turn.querySelector(':scope > ' + user)
        const record = prompt && nativeRenderedMessageRecord(prompt)
        if (!record || (record.storedId !== target.sessionId && (!target.runtimeId || record.runtimeId !== target.runtimeId))) continue
        const snapshot = saved.get(record.rowId)
        const anchor = savedTurnCardAnchor(turn)
        if (!snapshot || !anchor) continue
        present.add(turn)
        let card = cards.get(turn)
        if (!card || card.snapshotId !== snapshot.snapshotId) {
          card?.dispose()
          const options = { snapshot, lang, sameOwner: current,
            onReview: (selected, path) => openSavedTurnDiff(target.scope, selected, path, owner),
            onApply: (selected, action) => applySavedTurnChanges(target.scope, target.sessionId, target.sessionId, selected, action, owner),
            onResult: (outcome, action) => { notifySavedTurnOutcome(outcome, action); scheduleRead() },
            onError: (error, action) => { notifySavedTurnOutcome(null, action); scheduleRead() } }
          card = createTurnChangesCard(options)
          card.options = options
          card.snapshotId = snapshot.snapshotId
          card.element.setAttribute('data-hcv-turn-history-generated', '')
          cards.set(turn, card)
        } else card.update({ ...card.options, snapshot, lang })
        turn.querySelectorAll('[data-slot="aui_changed-files"]').forEach(node => node.setAttribute('data-hcv-saved-change-native', ''))
        placeSavedTurnCard(card.element, anchor)
      }
      for (const [turn, card] of cards) if (!present.has(turn)) {
        turn.querySelectorAll('[data-hcv-saved-change-native]').forEach(node => node.removeAttribute('data-hcv-saved-change-native'))
        card.dispose(); cards.delete(turn)
      }
    }
    async function read() {
      if (!current()) return
      if (reading) { reload = true; return }
      reading = true
      try {
        const page = await readTurnTimeline(owner, history)
        if (!current()) return
        history = { ...page, scope: target.scope }
        onChange()
        const next = await readSavedTurnChanges(target.scope, target.sessionId, target.sessionId, owner)
        if (current()) { changes = next; paint() }
      } catch { /* Unavailable history never becomes a fresh working-tree diff. */ }
      finally { reading = false; if (reload && alive) { reload = false; scheduleRead() } }
    }
    function scheduleRead() { clearTimeout(timer); timer = setTimeout(read, 120) }
    const stops = [target.view.$storedId, target.view.$runtimeId, target.view.$messagesEmpty]
      .filter(atom => typeof atom.listen === 'function').map(atom => atom.listen(schedule))
    scheduleRead()
    return { target, paint, current: () => current() ? history : null, refresh: scheduleRead,
      dispose() { alive = false; history = null; clearTimeout(timer); stops.forEach(stop => stop()); clear() } }
  }
  function sync() {
    const present = new Set()
    for (const surface of enabled() ? document.querySelectorAll(surfaceSelector) : []) {
      const target = tileTurnHistoryTarget(surface)
      if (!target) continue
      present.add(surface)
      let controller = controllers.get(surface)
      if (controller && (controller.target.view !== target.view || controller.target.scope !== target.scope ||
          controller.target.sessionId !== target.sessionId)) {
        controller.dispose(); controllers.delete(surface); controller = null
      }
      if (!controller) { controller = attach(target); controllers.set(surface, controller) }
      controller.paint()
    }
    for (const [surface, controller] of controllers) if (!present.has(surface)) { controller.dispose(); controllers.delete(surface) }
  }
  const observer = new MutationObserver(records => {
    if (!enabled()) return
    let rescan = false
    const reread = new Set()
    for (const record of records) {
      const target = record.target
      if (!(target instanceof Element) || target.closest(generated)) continue
      const surface = target.closest(surfaceSelector)
      if (surface) {
        const change = savedTurnMutation(record)
        rescan ||= Boolean(change)
        if (change === 'read') reread.add(surface)
      } else if (record.type === 'childList' && movedElementMatches(record, surfaceSelector)) rescan = true
    }
    for (const surface of reread) controllers.get(surface)?.refresh()
    if (rescan) schedule()
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-message-streaming', 'data-state'] })
  const theme = new MutationObserver(schedule)
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme', 'data-hermes-mode', 'lang'] })
  contrast.addEventListener('change', schedule)
  for (const type of ['message.complete', 'subagent.complete']) ctx.onEvent(type, event => {
    for (const controller of controllers.values()) if (event.session_id === controller.target.runtimeId) controller.refresh()
  })
  ctx.addEventListener(document, 'visibilitychange', () => { if (!document.hidden) { schedule(); controllers.forEach(controller => controller.refresh()) } })
  const storeStops = [host.state.connectionId, host.state.profile].map(atom => atom.listen(schedule))
  schedule()
  ctx.onDispose(() => {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect(); theme.disconnect()
    contrast.removeEventListener('change', schedule); storeStops.forEach(stop => stop())
    controllers.forEach(controller => controller.dispose()); controllers.clear()
  })
  return { current(surface) { return controllers.get(surface)?.current() || null } }
}
