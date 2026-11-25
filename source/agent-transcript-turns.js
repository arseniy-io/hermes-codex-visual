import { agentTranscriptPainted, agentTranscriptRole, agentTranscriptVisibleText } from './agent-transcript-visibility.js'
import { savedTimelineMetadata, timestampSeparatorTimes } from './chat-timestamp-data.js'

function text(row) {
  const value = row.display_content ?? row.content ?? row.text
  const raw = typeof value === 'string' ? value : Array.isArray(value)
    ? value.filter(part => part?.type === 'text').map(part => part.text || '').join('\n') : ''
  return agentTranscriptVisibleText(row, raw)
}
const key = (row, index) => String(row.message_uid ?? row.row_id ?? row.id ?? index)
const hasAssistantText = row => row.role === 'assistant' && row.display_kind !== 'hidden' &&
  (text(row).trim() || (Array.isArray(row.display_commentary) && row.display_commentary.some(value => typeof value === 'string' && value.trim())))

// Explicit native turn IDs own future history. Legacy actual user boundaries
// remain useful, but legacy assistant completion timestamps do NOT become
// final-answer-start times. Missing/compacted history breaks adjacency.
export function agentTranscriptTurns(rows, { nowMs = Date.now(), historyComplete = true } = {}) {
  const groups = []
  let current = null
  if (!historyComplete) groups.push({ key: 'missing-history', rows: [], descriptions: null })
  for (const [index, row] of rows.entries()) {
    if (!row || !agentTranscriptPainted(row)) continue
    if (row.row_kind === 'compaction' || row._compressed_summary === true || row.history_gap === true) {
      current = null
      groups.push({ key: 'break-' + key(row, index), rows: [row], descriptions: null })
      continue
    }
    const metadata = savedTimelineMetadata(row)
    const role = agentTranscriptRole(row)
    const authoredUser = role === 'user' && row.display_kind !== 'hidden' && text(row).trim()
    const opensNew = metadata ? current?.turnId !== metadata.turnId
      : authoredUser && current?.rows.length
    if (!current || opensNew) {
      current = { key: metadata ? metadata.turnId + ':' + key(row, index) : 'legacy-' + key(row, index), turnId: metadata?.turnId || null, rows: [] }
      groups.push(current)
    }
    current.rows.push(row)
  }
  for (const group of groups) {
    if (group.descriptions === null) continue
    const descriptions = []
    const user = group.rows.find(row => agentTranscriptRole(row) === 'user' && row.display_kind !== 'hidden' && text(row).trim())
    const inputMetadata = user && savedTimelineMetadata(user)
    if (user) descriptions.push({ role: 'user',
      sentAtMs: inputMetadata?.turnStartedAtMs ?? (Number.isFinite(user.timestamp) ? user.timestamp * 1000 : null),
      opensExchange: inputMetadata?.opensExchange })
    const final = group.rows.findLast(row => row.role === 'assistant' && row.display_kind !== 'hidden' && savedTimelineMetadata(row)?.phase === 'final')
    const finalMetadata = final && savedTimelineMetadata(final)
    if (group.rows.some(hasAssistantText)) descriptions.push({ role: 'assistant',
      sentAtMs: finalMetadata?.finalAssistantStartedAtMs ?? null,
      opensExchange: finalMetadata?.opensExchange })
    group.descriptions = descriptions
    group.finalMetadata = finalMetadata || null
  }
  const separators = timestampSeparatorTimes(groups.map(group => group.descriptions), nowMs)
  return groups.map((group, index) => ({ ...group, timestampSeparatorAtMs: separators[index] }))
}
