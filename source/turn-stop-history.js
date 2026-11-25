import { turnControlKey } from './turn-control-state.js'
import { savedTimelineMetadata } from './chat-timestamp-data.js'

export function elapsedTurnSeconds(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs <= 0 || endMs < startMs) return null
  return Math.floor((endMs - startMs) / 1000)
}

const isRowId = value => Number.isSafeInteger(value) && value > 0

const userPrompt = message => message.role === 'user' && !message.hidden && !message.id?.startsWith('user-queued-')

export function captureStopAttempt(messages, promptId, startMs, endMs) {
  const prompts = messages?.filter(userPrompt) || []
  const index = promptId ? prompts.findIndex(message => message.id === promptId) : prompts.length - 1
  const current = prompts[index]
  if (!current?.id) return null
  return { promptId: current.id, rowId: current.rowId,
    previousRowId: index > 0 ? prompts[index - 1].rowId : null,
    startedAtMs: startMs, requestedAtMs: endMs, seconds: elapsedTurnSeconds(startMs, endMs) }
}

// The managed worker can settle before attaching a completion receipt. Read
// this only under the confirmed, unchanged Stop owner, before any new turn.
// The newly persisted prompt must be the only durable input after the known
// predecessor, and any still-optimistic copy must have the captured prompt id.
export function stoppedPromptFromHistory(messages, attempt, timelineRows = []) {
  const prompts = messages?.filter(userPrompt) || []
  const exact = prompts.find(message => message.id === attempt.promptId)
  if (isRowId(exact?.rowId)) return exact.rowId
  const anchor = attempt.previousRowId === null ? -1 : prompts.findIndex(message => message.rowId === attempt.previousRowId)
  if (attempt.previousRowId !== null && (!isRowId(attempt.previousRowId) || anchor < 0)) return null
  const tail = prompts.slice(anchor + 1)
  if (tail.some(message => !isRowId(message.rowId) && message.id !== attempt.promptId)) return null
  const durable = tail.filter(message => isRowId(message.rowId))
  if (durable.length === 1) return durable[0].rowId
  if (durable.length < 2 || attempt.seconds == null) return null

  // Native replay can add finished automation inputs that were absent from
  // the live view. On the local clock their producer timestamps must fall
  // outside the observed lifetime of the one execution we actually stopped.
  const ids = new Set(durable.map(message => message.rowId))
  const matching = timelineRows.filter(row => {
    if (!row.isHumanUser || !ids.has(row.id)) return false
    const timing = savedTimelineMetadata(row)
    return timing?.phase === 'input' && timing.turnStartedAtMs >= attempt.startedAtMs &&
      timing.turnStartedAtMs <= attempt.requestedAtMs
  })
  return matching.length === 1 ? matching[0].id : null
}

export function stoppedPromptRow(receipt, promptId) {
  const rowId = receipt?.user_row_id
  if (typeof receipt?.submission_id !== 'string' || !receipt.submission_id ||
      promptId !== `user-${receipt.submission_id}` || !isRowId(rowId) ||
      !Array.isArray(receipt.row_ids) || !receipt.row_ids.includes(rowId)) return null
  return rowId
}

const rowKey = (target, rowId) => isRowId(rowId)
  ? 'stopped-turn:' + JSON.stringify([target.connectionId, target.profile, target.storedId, rowId])
  : null

// Live ids can change on hydration. A durable row is safe only in its own
// connection, profile and stored conversation. No transcript text is stored.
export function createTurnStopHistory(storage) {
  const recent = new Map()
  const listeners = new Set()
  return {
    read(target, promptId, rowId) {
      const saved = rowKey(target, rowId)
      return recent.get(JSON.stringify([turnControlKey(target), promptId])) ??
        (saved ? storage?.get(saved, null) : null)
    },
    record(target, { promptId, rowId, seconds }) {
      if (typeof promptId !== 'string' || !promptId) return
      const stopped = { seconds }
      const saved = rowKey(target, rowId)
      if (saved) storage?.set(saved, stopped)
      recent.set(JSON.stringify([turnControlKey(target), promptId]), stopped)
      if (recent.size > 200) recent.delete(recent.keys().next().value)
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() { recent.clear(); listeners.clear() },
  }
}
