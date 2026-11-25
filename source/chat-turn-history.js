import { host } from '@hermes/plugin-sdk'
import { mountCSS, chatStyles } from './style-scope.js'
import { nativeRenderedMessageRecord } from './native-rendered-message.js'
import { registerTileTurnHistory } from './chat-tile-turn-history.js'
import { nativeSessionView } from './sidebar-session-state.js'
import { createPrimaryHistoryTargetReader, samePrimaryHistoryTarget } from './primary-turn-history-owner.js'
import { savedTurnCardAnchor, placeSavedTurnCard, savedTurnMutation } from './turn-card-anchor.js'
import { movedElementMatches } from './dom-changes.js'
import { savedTimelineMetadata, timestampSeparatorParts, timestampSeparatorTimes } from './chat-timestamp-data.js'
import { timestampSeparatorStyles } from './chat-timestamp.js'
import { createTurnChangesCard as createTurnChangesDom } from './turn-changes-dom.js'
import { turnChangesCardStyles } from './turn-changes-card.js'
import { applySavedTurnChanges, openSavedTurnDiff, readSavedTurnChanges, readTurnTimeline,
  setTurnHistoryContext, notifySavedTurnOutcome } from './turn-history-client.js'

const primary = '[data-chat-surface][data-composer-target="main"][data-session-anchor="workspace"]'
const pair = '[data-slot="aui_turn-pair"]'
const user = '[data-slot="aui_user-message-root"]'
const assistant = '[data-slot="aui_assistant-message-root"]'
const generated = '[data-hcv-turn-history-generated]'

// The full saved sequence establishes adjacency even when Hermes has mounted
// only its last window. A cropped first DOM message is never a new first turn.
export function mainTimestampGroups(rows, complete) {
  const groups = []
  let current
  if (!complete) groups.push({ descriptions: null })
  for (const row of rows) {
    if (row.row_kind === 'compaction' || row.history_gap) {
      current = null
      groups.push({ descriptions: null })
      continue
    }
    const meta = savedTimelineMetadata(row)
    if (row.isHumanUser || (!current && meta) || (meta && current?.turnId && meta.turnId !== current.turnId)) {
      current = { turnId: meta?.turnId, userRowId: row.isHumanUser ? row.row_id ?? row.id : null,
        descriptions: [], hasAssistant: false, final: null }
      groups.push(current)
    }
    if (!current) continue
    if (row.isHumanUser) current.descriptions.push({ role: 'user',
      sentAtMs: meta?.turnStartedAtMs ?? (Number.isFinite(row.timestamp) ? row.timestamp * 1000 : null),
      opensExchange: meta?.opensExchange })
    if (row.hasVisibleAssistantText) current.hasAssistant = true
    if (row.hasVisibleAssistantText && meta?.phase === 'final') current.final = meta
  }
  for (const group of groups) if (group.hasAssistant) group.descriptions.push({ role: 'assistant',
    sentAtMs: group.final?.finalAssistantStartedAtMs ?? null, opensExchange: group.final?.opensExchange })
  return groups
}

export function registerChatTurnHistory(ctx, active) {
  setTurnHistoryContext(ctx)
  const listeners = new Set()
  const cards = new Map(), dates = new Map()
  const contrast = matchMedia('(forced-colors: none)')
  let disposed = false, generation = 0, value = null, changes = null, requested = null
  let loadingEpoch = null, reload = false, timer, frame
  const enabled = () => !disposed && contrast.matches && document.documentElement.matches(active) && !document.hidden
  const readPrimaryTarget = createPrimaryHistoryTargetReader({ state: host.state, readView: nativeSessionView })
  const primaryTarget = () => {
    const surfaces = [...document.querySelectorAll(primary)]
    return surfaces.length === 1 ? readPrimaryTarget(surfaces[0]) : null
  }
  const targetKey = target => JSON.stringify([target?.scope || null, target?.sessionId || null])
  const owned = (scope, owner = value?.owner) => enabled() && owner?.scope === scope && owner.isCurrent()
  const current = () => value && owned(value.scope, value.owner) ? value : null
  let observedTarget = null, viewStops = []
  function targetChanged() {
    const target = primaryTarget()
    if (!samePrimaryHistoryTarget(target, observedTarget) || targetKey(target) !== requested) scopeChanged(target)
  }
  const notify = () => { for (const listener of listeners) listener() }
  const tiles = registerTileTurnHistory(ctx, active, notify)
  const announce = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint() })
  }
  const clear = () => {
    for (const card of cards.values()) card.dispose()
    cards.clear()
    for (const date of dates.values()) date.remove()
    dates.clear()
    document.querySelectorAll(primary + ' [data-hcv-saved-change-native]').forEach(node => node.removeAttribute('data-hcv-saved-change-native'))
  }
  async function read() {
    const target = primaryTarget()
    if (!enabled() || !target) return
    const epoch = generation, scope = target.scope
    if (loadingEpoch === epoch) { reload = true; return }
    loadingEpoch = epoch
    const owner = { ...target, isCurrent: () =>
      epoch === generation && enabled() && samePrimaryHistoryTarget(target, primaryTarget()) }
    const valid = () => owned(scope, owner)
    try {
      const result = await readTurnTimeline(owner, value)
      if (!valid()) return
      value = { ...result, scope, owner }
      notify()
      announce()
      try {
        const saved = await readSavedTurnChanges(scope, result.sessionId, result.sessionId, owner)
        if (!valid()) return
        changes = saved
        announce()
      } catch { /* Missing historical patches do not become a current Git diff. */ }
    } catch {
      // A late result or unavailable backend never retargets an existing card.
      if (valid() && !value) { changes = null; notify(); announce() }
    } finally {
      if (loadingEpoch === epoch) {
        loadingEpoch = null
        if (epoch === generation && reload && !disposed) { reload = false; scheduleRead() }
      }
    }
  }
  function scheduleRead() {
    clearTimeout(timer)
    timer = setTimeout(read, 120)
  }
  function scopeChanged(target = primaryTarget()) {
    generation++
    reload = false
    requested = targetKey(target)
    observedTarget = target
    viewStops.forEach(stop => stop())
    viewStops = [target?.view.$runtimeId, target?.view.$storedId].filter(atom => typeof atom?.listen === 'function')
      .map(atom => atom.listen(targetChanged))
    value = changes = null
    clear()
    notify()
    scheduleRead()
  }
  function paint() {
    const data = current()
    if (!data) { clear(); return }
    const lang = document.documentElement.lang.startsWith('ru') ? 'ru' : 'en'
    const groups = mainTimestampGroups(data.rows, data.complete)
    const separators = timestampSeparatorTimes(groups.map(group => group.descriptions))
    const byPrompt = new Map(groups.flatMap((group, index) => group.userRowId != null ? [[group.userRowId, separators[index]]] : []))
    const saved = new Map((changes?.turns || []).map(turn => [turn.userRowId, turn]))
    const presentDates = new Set(), presentCards = new Set()
    for (const turn of document.querySelectorAll(primary + ' ' + pair)) {
      const prompt = turn.querySelector(':scope > ' + user)
      const record = prompt && nativeRenderedMessageRecord(prompt)
      if (!record || (record.storedId !== data.sessionId && record.storedId !== data.requestedSessionId && record.runtimeId !== JSON.parse(data.scope)[2])) continue
      const at = byPrompt.get(record.rowId)
      if (at != null) {
        const parts = timestampSeparatorParts(at, lang)
        if (!parts) continue
        let date = dates.get(turn)
        if (!date) {
          date = document.createElement('div')
          date.setAttribute('data-hcv-timestamp-separator', '')
          date.setAttribute('data-hcv-turn-history-generated', '')
          date.setAttribute('data-markdown-copy', 'exclude')
          date.setAttribute('role', 'separator')
          const time = document.createElement('time'), day = document.createElement('span')
          day.setAttribute('data-hcv-timestamp-day', '')
          time.append(day, document.createTextNode(''))
          date.append(time)
          dates.set(turn, date)
        }
        if (date.getAttribute('aria-label') !== parts.label) {
          date.setAttribute('aria-label', parts.label)
          date.firstChild.dateTime = parts.iso
          date.firstChild.firstChild.textContent = parts.date
          date.firstChild.lastChild.data = parts.join + parts.time
        }
        if (turn.firstElementChild !== date) turn.prepend(date)
        presentDates.add(turn)
      }
      const snapshot = saved.get(record.rowId)
      const final = savedTurnCardAnchor(turn)
      if (!snapshot || !final) continue
      presentCards.add(turn)
      let card = cards.get(turn)
      if (!card || card.snapshotId !== snapshot.snapshotId) {
        card?.dispose()
        const sameOwner = () => owned(data.scope) && current()?.sessionId === data.sessionId
        const options = { snapshot, lang, sameOwner,
          onReview: (selected, path) => openSavedTurnDiff(data.scope, selected, path, data.owner),
          onApply: (selected, action) => applySavedTurnChanges(data.scope, data.sessionId, data.sessionId, selected, action, data.owner),
          onResult: (outcome, action) => { notifySavedTurnOutcome(outcome, action); scheduleRead() },
          onError: (error, action) => { notifySavedTurnOutcome(null, action); scheduleRead() } }
        card = createTurnChangesDom(options)
        card.options = options
        card.snapshotId = snapshot.snapshotId
        card.element.setAttribute('data-hcv-turn-history-generated', '')
        cards.set(turn, card)
      } else card.update({ ...card.options, snapshot, lang })
      for (const native of turn.querySelectorAll('[data-slot="aui_changed-files"]')) native.setAttribute('data-hcv-saved-change-native', '')
      placeSavedTurnCard(card.element, final)
    }
    for (const [turn, date] of dates) if (!presentDates.has(turn)) { date.remove(); dates.delete(turn) }
    for (const [turn, card] of cards) if (!presentCards.has(turn)) {
      turn.querySelectorAll('[data-hcv-saved-change-native]').forEach(node => node.removeAttribute('data-hcv-saved-change-native'))
      card.dispose(); cards.delete(turn)
    }
  }
  const subscriptions = [host.state.activeSessionId, host.state.focusedSessionId,
    host.state.focusedStoredSessionId, host.state.focusedSessionOwner].filter(Boolean)
    .map(atom => atom.subscribe(targetChanged))
  const observer = new MutationObserver(records => {
    if (!enabled()) return
    let repaint = false, reread = false
    for (const record of records) {
      const target = record.target
      if (!(target instanceof Element) || target.closest(generated)) continue
      if (target.closest(primary)) {
        const change = savedTurnMutation(record)
        repaint ||= Boolean(change)
        reread ||= change === 'read'
      } else if (record.type === 'childList' && movedElementMatches(record, primary)) targetChanged()
    }
    if (repaint) announce()
    // A terminal tool-only turn may arrive without a message.complete event.
    if (reread) scheduleRead()
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-message-streaming', 'data-state'] })
  const themeChanged = () => {
    if (!enabled()) clear()
    else { announce(); scheduleRead() }
  }
  const theme = new MutationObserver(themeChanged)
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme', 'data-hermes-mode', 'lang'] })
  contrast.addEventListener('change', themeChanged)
  for (const type of ['message.complete', 'subagent.complete']) ctx.onEvent(type, event => {
    if (event.session_id === primaryTarget()?.runtimeId) scheduleRead()
  })
  ctx.addEventListener(document, 'visibilitychange', () => { if (enabled()) scheduleRead() })
  mountCSS(ctx, 'data-hcv-turn-history-style', `${timestampSeparatorStyles(active + ' ' + primary)}
    ${turnChangesCardStyles(active + ' [data-chat-surface]:is([data-composer-target="main"], [data-composer-target^="tile:"])')}
    ${active} [data-hcv-saved-change-native] { display: none !important; }
  `, chatStyles)
  scopeChanged()
  ctx.onDispose(() => {
    disposed = true; generation++
    clearTimeout(timer); cancelAnimationFrame(frame)
    observer.disconnect(); theme.disconnect(); contrast.removeEventListener('change', themeChanged)
    subscriptions.forEach(stop => stop()); viewStops.forEach(stop => stop()); clear(); listeners.clear()
  })
  return { current, forSurface(surface) { return surface?.matches(primary) ? current() : tiles.current(surface) },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) }, refresh: scheduleRead }
}
