import { committedFiber } from './sidebar-recents.js'

const recordId = value => Number.isSafeInteger(value) && value > 0 ? value : null
const atomValue = value => {
  try { return typeof value?.get === 'function' ? value.get() : undefined } catch { return undefined }
}

// Hermes 0.23.1+2062: system runtime messages do not carry custom.rowId,
// while SessionView and the selected TranscriptWindow still own the original
// ChatMessage with that rowId. Join by the exact renderer message id; never
// derive a durable row from timestamps, list positions, text, or task goals.
export function nativeRenderedMessageRecord(node, readFiber = committedFiber) {
  const values = new Set()
  const messageIds = new Set()
  const add = value => {
    if (!value || typeof value !== 'object' || values.has(value)) return
    values.add(value)
    // Root and message AUI clients both expose message(). Ignore unavailable
    // accessors; a native DOM message id takes precedence over outer scopes.
    if (typeof value.message === 'function' && value.message.source) {
      try {
        const runtime = value.message().__internal_getRuntime?.()
        const message = runtime?.getState?.()
        if (typeof message?.id === 'string' && message.id) messageIds.add(message.id)
      } catch { /* Not every ancestor dependency is a message client. */ }
    }
  }
  for (let fiber = readFiber(node); fiber; fiber = fiber.return) {
    add(fiber.memoizedProps?.value)
    for (let context = fiber.dependencies?.firstContext; context; context = context.next) add(context.memoizedValue)
  }
  const elementId = node?.closest?.('[data-message-id]')?.getAttribute('data-message-id')
  // StickyHumanMessageContainer writes useAuiState(s => s.message.id) to this
  // exact native element. An outer AUI scope can point at the latest assistant
  // while an older user bubble retains its own canonical DOM id.
  if (!elementId && messageIds.size !== 1) return null
  const messageId = elementId || [...messageIds][0]
  // AUI proxy contexts also expose arbitrary truthy accessors. A SessionView
  // must supply actual owner identities, not just properties of that shape.
  const views = [...values].filter(value => Array.isArray(atomValue(value.$messages)) &&
    [atomValue(value.$runtimeId), atomValue(value.$storedId)].some(id => typeof id === 'string' && id))
  if (views.length !== 1) return null
  const view = views[0]
  const runtimeId = atomValue(view.$runtimeId)
  const storedId = atomValue(view.$storedId)
  if (!runtimeId && !storedId) return null
  const lists = [atomValue(view.$messages), ...[...values].map(value => value.currentMessages)]
    .filter(Array.isArray)
  const matches = lists.flatMap(messages => messages.filter(message => message?.id === messageId))
  if (!matches.length) return null
  const rowIds = [...new Set(matches.map(message => recordId(message.rowId)).filter(Boolean))]
  if (rowIds.length > 1) return null
  // A hydrated assistant bubble can contain several durable source rows.
  // Expose those exact per-part ids as well, without guessing the final row.
  const sourceRowIds = [...new Set(matches.flatMap(message => Array.isArray(message.parts)
    ? message.parts.map(part => recordId(part?.sourceRowId)).filter(Boolean) : []))]
  const message = matches.find(message => recordId(message.rowId) === rowIds[0]) || matches[0]
  return { message, rowId: rowIds[0] ?? null, sourceRowIds, runtimeId: runtimeId || null, storedId: storedId || null }
}

// The text part has its own AUI scope inside a merged assistant bubble.
// Reading that scope keeps a diagnostic separate from quoted model prose.
export function nativeRenderedTextPart(node, readFiber = committedFiber) {
  for (let fiber = readFiber(node); fiber; fiber = fiber.return) {
    const values = [fiber.memoizedProps?.value]
    for (let context = fiber.dependencies?.firstContext; context; context = context.next) values.push(context.memoizedValue)
    for (const value of values) {
      if (typeof value?.part !== 'function' || !value.part.source) continue
      try {
        const part = value.part().__internal_getRuntime?.().getState?.()
        if (part?.type === 'text' && typeof part.text === 'string') return part
      } catch { /* Ancestor scopes need not expose a mounted text part. */ }
    }
  }
  return null
}

export function nativeInterruptedDelegateActivity(node, message, readFiber = committedFiber) {
  const ids = new Set()
  for (const part of message?.parts || []) {
    if (part.type !== 'tool-call' || part.toolName !== 'delegate_task') continue
    let result = part.result
    if (typeof result === 'string') { try { result = JSON.parse(result) } catch { continue } }
    for (const id of result?.subagent_ids || []) if (typeof id === 'string') ids.add(id)
    for (const child of result?.results || []) if (typeof child?.subagent_id === 'string') ids.add(child.subagent_id)
  }
  for (let fiber = readFiber(node); fiber; fiber = fiber.return) {
    const row = fiber.memoizedProps?.row
    if (row?.status === 'interrupted' && ids.has(row.id) && typeof row.sessionId === 'string' && row.sessionId &&
        Array.isArray(row.activity) && row.activity.every(value => typeof value === 'string')) return row
  }
  return null
}
