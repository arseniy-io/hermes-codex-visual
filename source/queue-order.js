import { host } from '@hermes/plugin-sdk'

const storageKey = 'hermes.desktop.composerQueue.v1'
const dragType = 'application/x-hcv-queued-prompt'
const rowSelector = '[data-slot="status-row"]'
const gripSelector = '[data-hcv-queue-grip]'
const editing = '[data-slot="composer-surface"] [class~="bg-accent/18"]:has(> div > button + button)'

function queueIdentity(dock, panel) {
  const state = host.state
  const runtime = state.focusedSessionId.get()
  const stored = state.focusedStoredSessionId.get()
  const primary = dock.querySelector('form[data-tour="composer"]')
  const target = dock.closest('[data-floating-composer-target]')?.dataset.floatingComposerTarget
    ?? dock.closest('[data-composer-target]')?.dataset.composerTarget
  const focused = primary ? runtime === state.activeSessionId.get() : stored && target === `tile:${stored}`
  const parked = panel.querySelector('.status-section-icon > .codicon-debug-pause')
  if (!runtime || !focused || (!state.busy.get() && !parked) || dock.querySelector(editing)) return null

  const owner = state.focusedSessionOwner.get()
  return {
    keys: [...new Set([stored, runtime].filter(Boolean))],
    scope: JSON.stringify([owner?.connectionId ?? state.connectionId.get(), owner?.profile ?? state.profile.get(), stored, runtime]),
  }
}

function readQueue(dock, panel, copy) {
  const identity = queueIdentity(dock, panel)
  const rows = Array.from(panel.querySelectorAll(`:scope > .status-section-body > ${rowSelector}`))
  if (!identity || rows.length < 2) return null

  try {
    const raw = localStorage.getItem(storageKey)
    const queues = JSON.parse(raw)
    if (!queues || typeof queues !== 'object' || Array.isArray(queues)) return null

    // Check both the native scope and the rendered queue before mapping a DOM
    // position to an entry id. A stale or ambiguous view cannot sort a queue.
    const matching = identity.keys.filter(key => {
      if (!Object.hasOwn(queues, key)) return false
      const entries = queues[key]
      return Array.isArray(entries) && entries.length === rows.length && entries.every((entry, index) => {
        if (typeof entry?.id !== 'string' || typeof entry.text !== 'string' || !Array.isArray(entry.attachments)) return false
        const caption = entry.displayKind === 'hidden'
          ? copy.hiddenQueued
          : (entry.displayText ?? entry.text).trim() || (entry.attachments.length ? copy.attachmentOnly : copy.emptyTurn)
        return rows[index].querySelector('.status-row-content p')?.textContent === caption
      })
    })
    if (matching.length !== 1) return null
    const key = matching[0]
    const entries = queues[key]
    const ids = entries.map(entry => entry.id)
    if (new Set(ids).size !== ids.length) return null
    return { scope: identity.scope, key, entries, ids, rows, queues, raw }
  } catch {
    return null
  }
}

function sameQueue(before, after) {
  return after && before.scope === after.scope && before.key === after.key && before.ids.length === after.ids.length
    && before.ids.every((id, index) => id === after.ids[index] && before.rows[index] === after.rows[index])
}

function saveOrder(snapshot, from, to) {
  if (from === to || from < 0 || to < 0 || Math.max(from, to) >= snapshot.ids.length) return false

  const entries = snapshot.entries.slice()
  const [entry] = entries.splice(from, 1)
  entries.splice(to, 0, entry)
  try {
    if (localStorage.getItem(storageKey) !== snapshot.raw) return false
    localStorage.setItem(storageKey, JSON.stringify({ ...snapshot.queues, [snapshot.key]: entries }))
  } catch {
    return false
  }
  // Use Hermes' existing cross-window queue reload for this window as well.
  // Its normal send and edit actions still use the original entry objects.
  window.dispatchEvent(new StorageEvent('storage', { key: storageKey, storageArea: localStorage }))
  return true
}

export function bindQueueOrder(dock, panel, t, copy) {
  const events = new AbortController()
  const options = { signal: events.signal }
  const announcement = document.createElement('span')
  announcement.className = 'sr-only'
  announcement.setAttribute('role', 'status')
  panel.append(announcement)
  let drag
  let marker

  const sync = () => {
    const snapshot = readQueue(dock, panel, copy)
    panel.toggleAttribute('data-hcv-queue-reorder', Boolean(snapshot))
    if (drag && !sameQueue(drag.snapshot, snapshot)) clearDrag()
  }
  const clearMarker = () => {
    marker?.removeAttribute('data-hcv-queue-drop')
    marker = undefined
  }
  const clearDrag = () => {
    clearMarker()
    drag?.element.removeAttribute('data-hcv-queue-dragging')
    drag = undefined
  }
  const move = (before, from, to) => {
    const current = readQueue(dock, panel, copy)
    if (!sameQueue(before, current) || !saveOrder(current, from, to)) return false
    announcement.textContent = t('queueMoved', to + 1, current.ids.length)
    return true
  }
  const gripOf = event => event.target instanceof Element ? event.target.closest(gripSelector) : null
  const rowOf = event => event.target instanceof Element ? event.target.closest(rowSelector) : null

  panel.addEventListener('dragstart', event => {
    if (!gripOf(event) || !event.dataTransfer) return
    const snapshot = readQueue(dock, panel, copy)
    const element = rowOf(event)
    const index = snapshot?.rows.indexOf(element) ?? -1
    if (index < 0) {
      event.preventDefault()
      return
    }
    drag = { snapshot, element, index }
    event.dataTransfer.setData(dragType, 'queued')
    event.dataTransfer.effectAllowed = 'move'
    const bounds = element.getBoundingClientRect()
    event.dataTransfer.setDragImage(element, event.clientX - bounds.left, event.clientY - bounds.top)
    element.dataset.hcvQueueDragging = ''
    event.stopPropagation()
  }, options)
  panel.addEventListener('dragover', event => {
    if (!drag || !event.dataTransfer?.types.includes(dragType)) return
    const target = rowOf(event)
    if (!drag.snapshot.rows.includes(target)) {
      clearMarker()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    if (marker !== target) clearMarker()
    marker = target
    const box = target.getBoundingClientRect()
    target.dataset.hcvQueueDrop = event.clientY >= box.top + box.height / 2 ? 'after' : 'before'
  }, options)
  panel.addEventListener('drop', event => {
    if (!drag || !event.dataTransfer?.types.includes(dragType)) return
    event.preventDefault()
    event.stopPropagation()
    const { snapshot, index } = drag
    const target = rowOf(event)
    const at = snapshot.rows.indexOf(target)
    if (at >= 0) {
      const box = target.getBoundingClientRect()
      const boundary = at + Number(event.clientY >= box.top + box.height / 2)
      move(snapshot, index, boundary - Number(boundary > index))
    }
    clearDrag()
  }, options)
  panel.addEventListener('dragend', clearDrag, options)
  panel.addEventListener('dragleave', event => {
    if (!(event.relatedTarget instanceof Node) || !panel.contains(event.relatedTarget)) clearMarker()
  }, options)
  panel.addEventListener('keydown', event => {
    const grip = gripOf(event)
    if (!grip || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const snapshot = readQueue(dock, panel, copy)
    const index = snapshot?.rows.indexOf(rowOf(event)) ?? -1
    if (index < 0 || !move(snapshot, index, index + (event.key === 'ArrowUp' ? -1 : 1))) return
    requestAnimationFrame(() => {
      if (grip.isConnected && document.activeElement === document.body) grip.focus()
    })
  }, options)

  const release = [
    host.state.busy, host.state.focusedSessionId, host.state.focusedStoredSessionId,
  ].map(state => state.listen(sync))

  return {
    add(actions) {
      const grip = document.createElement('button')
      grip.type = 'button'
      grip.draggable = true
      grip.dataset.hcvQueueGrip = ''
      grip.setAttribute('aria-label', t('queueMove'))
      grip.title = t('queueMove')
      actions.parentElement.append(grip)
      return () => grip.remove()
    },
    sync,
    dispose() {
      events.abort()
      release.forEach(stop => stop())
      clearDrag()
      panel.removeAttribute('data-hcv-queue-reorder')
      announcement.remove()
    },
  }
}

