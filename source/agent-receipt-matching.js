const transcript = '[data-slot="aui_thread-content"]'

function parseReceipt(heading) {
  const match = /^Subagent (Task|Tasks) ([^:]+): (.+)$/.exec(heading)
  if (!match) return null
  const [, kind, outcome, text] = match
  const batch = kind === 'Tasks' && /^(.*) \((\d+) tasks\)$/.exec(text)
  if (kind === 'Tasks' && !batch) return null
  return { outcome, goals: batch ? batch[1] : text, count: batch ? Number(batch[2]) : 1 }
}

// Older receipts have no call ID. Even compatible statuses cannot disambiguate
// repeated identical goals or two receipts for the same card.
export function matchAgentReceipt(target, heading, rowsByCard, receipts = [[target, heading]]) {
  const parsed = parseReceipt(heading)
  if (!parsed) return null
  const { outcome, goals, count } = parsed
  const expectedStatus = { Completed: 'completed', Failed: 'failed', 'Timed Out': 'failed',
    Interrupted: 'interrupted', Cancelled: 'interrupted' }[outcome]
  if (!expectedStatus) return null
  const matches = [...rowsByCard].filter(([card, entries]) =>
    card.closest(transcript) === target.closest(transcript) &&
    Boolean(card.compareDocumentPosition(target) & 4) &&
    entries.length === count && entries.map(row => row.goal).join('; ') === goals)
  if (matches.length !== 1) return null
  const [card, entries] = matches[0]
  if (!entries.every(row => row.status === 'dispatched' || row.status === expectedStatus)) return null
  const sameReceipts = receipts.filter(([other, text]) => {
    const candidate = parseReceipt(text)
    return candidate?.goals === goals && candidate.count === count &&
      other.closest(transcript) === target.closest(transcript) && Boolean(card.compareDocumentPosition(other) & 4)
  })
  return sameReceipts.length === 1 ? { outcome, count, entries } : null
}

// The display heading truncates its goal. A durable metadata projection uses
// the actual receipt row id and delegation id, independent of that heading.
export function canonicalAgentReceipt(rowId, receipts) {
  if (!Number.isSafeInteger(rowId) || rowId <= 0 || !Array.isArray(receipts)) return null
  const matches = receipts.filter(receipt => receipt?.row_id === rowId)
  if (matches.length !== 1) return null
  const receipt = matches[0]
  if (typeof receipt.delegation_id !== 'string' || !receipt.delegation_id ||
      !Array.isArray(receipt.agents) || !receipt.agents.length) return null
  const ids = new Set()
  for (const agent of receipt.agents) {
    if (typeof agent?.subagent_id !== 'string' || !agent.subagent_id || ids.has(agent.subagent_id) ||
        !['completed', 'failed', 'interrupted'].includes(agent.status)) return null
    ids.add(agent.subagent_id)
  }
  return receipt
}
