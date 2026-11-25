// Hermes session.transcript returns chronological display rows. Match tool
// results by call id, preserving the position of the assistant's actual call.
import { agentTranscriptPainted, agentTranscriptRole, agentTranscriptVisibleText } from './agent-transcript-visibility.js'
import { translateTranscriptTurnNotice } from './system-turn-notice-copy.js'
const object = value => {
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return value && typeof value === 'object' ? value : null
}

// Codex Desktop 26.1111.2228.0, 907538.0572f09d40.js, O5Ra.K.
// Non-GPT names are literal producer values, not a guessed title-cased label.
export function agentModelDisplayName(value) {
  if (typeof value !== 'string') return ''
  if (!value.trimStart().toLowerCase().startsWith('gpt')) return value
  const separator = /^gpt-\d/iu.test(value.trimStart()) ? ' ' : '-'
  return value.split(/(\s+)/).map(word => !word.trim().length ? word : word.split('-')
    .map((part, index) => part.toLowerCase() === 'gpt' ? 'GPT'
      : part.toLowerCase() === 'oai' ? 'OAI'
        : index > 0 && part.length ? part[0].toUpperCase() + part.slice(1) : part)
    .join(separator).replace(/^GPT (?=\d)/u, 'GPT-')).join('')
}

// 680583.ad73baf6a2.js N uses this select in the subagent header;
// Russian values are from the active 199366.4a1cb2029e.js locale.
const reasoningNames = {
  ru: { none: 'Нет', minimal: 'Минимальное', low: 'Лёгкое', medium: 'Среднее', high: 'Высокое',
    xhigh: 'Очень высокое', max: 'Max', ultra: 'Ultra', persistent: 'Постоянное' },
  en: { none: 'None', minimal: 'Minimal', low: 'Light', medium: 'Medium', high: 'High',
    xhigh: 'Extra High', max: 'Max', ultra: 'Ultra', persistent: 'Persistent' },
}
export function agentReasoningEffortName(value, lang) {
  return reasoningNames[lang]?.[value] || ''
}

export function agentSessionMetadata(details) {
  const record = object(details?.session) || object(details) || {}
  const config = object(record.model_config) || {}
  // agent_init.py saves the resolved child reasoning_config. This is the
  // same enabled/effort projection used by delegate_tool_child_run._route_report.
  const reasoning = object(config.reasoning_config) || {}
  const effort = typeof record.reasoning_effort === 'string' ? record.reasoning_effort
    : reasoning.enabled === false ? 'none' : typeof reasoning.effort === 'string' ? reasoning.effort : ''
  return { model: typeof record.model === 'string' ? record.model : '', effort,
    profile: typeof record.profile === 'string' ? record.profile : '' }
}

// Counts belong to the returned patch, never to the requested replacement.
// A file list or a successful write without a patch cannot prove these totals.
export function agentPartDiff(part) {
  const result = object(part?.result)
  const text = typeof result?.diff === 'string' ? result.diff
    : typeof result?.inline_diff === 'string' ? result.inline_diff : null
  if (!text) return null
  let added = 0
  let removed = 0
  let oldRemaining = 0
  let newRemaining = 0
  let proven = false
  for (const line of text.split(/\r?\n/)) {
    const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line)
    if (hunk) {
      oldRemaining = Number(hunk[1] ?? 1)
      newRemaining = Number(hunk[2] ?? 1)
      proven = true
    } else if (oldRemaining || newRemaining) {
      if (line.startsWith('+') && newRemaining) { added++; newRemaining-- }
      else if (line.startsWith('-') && oldRemaining) { removed++; oldRemaining-- }
      else if (line.startsWith(' ')) {
        oldRemaining = Math.max(0, oldRemaining - 1)
        newRemaining = Math.max(0, newRemaining - 1)
      }
    }
  }
  return { text, ...(proven && { added, removed }) }
}

export function transcriptText(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.filter(item => item?.type === 'text')
    .map(item => item.text || '').join('\n')
  return value == null ? '' : JSON.stringify(value, null, 2)
}

const rowText = row => transcriptText(row.display_content ?? row.content ?? row.text)
const calls = row => Array.isArray(row?.tool_calls) ? row.tool_calls :
  Array.isArray(row?.content) ? row.content.filter(part => part?.type === 'tool-call') : []
const callId = call => call?.id || call?.toolCallId || call?.tool_call_id
// REST exposes canonical DB columns as JSON text; live frames use the
// underscore-prefixed projection. Both describe the same durable occurrence.
const callUids = row => object(row?._tool_call_uids ?? row?.tool_call_uids) || {}
const resultUid = row => {
  const value = row?._tool_call_uid ?? row?.tool_call_uid
  return typeof value === 'string' && value ? value : undefined
}

function toolPart(call, result, key) {
  const fn = call.function ?? call
  const rawArgs = fn.arguments ?? fn.args
  const args = object(rawArgs) || {}
  const rawResult = result ? rowText(result) : undefined
  return {
    type: 'tool-call', toolCallId: callId(call) || key,
    toolName: fn.name || fn.toolName || result?.name || '', args,
    argsText: rawArgs === undefined ? '' : typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs, null, 2),
    result: rawResult === undefined ? undefined : object(rawResult) ?? rawResult,
    outputText: rawResult,
    completedAt: result?.timestamp ?? (result ? 1 : undefined),
    isError: Boolean(result?.is_error || result?.isError),
  }
}

export function agentTranscriptBlocks(rows, { lang = 'en' } = {}) {
  const byUid = new Map()
  const pendingById = new Map()
  const blocks = []
  const addTools = (parts, key) => {
    if (!parts.length) return
    const prior = blocks.at(-1)
    if (prior?.kind === 'tools') prior.parts.push(...parts)
    else blocks.push({ kind: 'tools', key, parts })
  }
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object') continue
    if (!agentTranscriptPainted(row)) continue
    const key = String(row.message_uid ?? row.row_id ?? row.id ?? index)
    const text = translateTranscriptTurnNotice(row, agentTranscriptVisibleText(row, rowText(row)), lang)
    const role = agentTranscriptRole(row)
    if (row.row_kind === 'compaction' || row._compressed_summary === true) {
      if (text.trim()) blocks.push({ kind: 'compaction', key, text })
      continue
    }
    if (role === 'assistant') {
      if (row.display_kind !== 'hidden' && Array.isArray(row.display_commentary)) {
        for (const [offset, commentary] of row.display_commentary.entries()) {
          if (typeof commentary === 'string' && commentary.trim()) blocks.push({ kind: 'assistant', key: key + '-commentary-' + offset, text: commentary, timestamp: row.timestamp })
        }
      }
      if (text.trim()) blocks.push({ kind: 'assistant', key: key + '-text', text, timestamp: row.timestamp })
      const occurrence = new Map()
      const parts = calls(row).flatMap((call, offset) => {
        const id = callId(call)
        let uid = callUids(row)[id]
        if (Array.isArray(uid)) {
          const nth = occurrence.get(id) || 0
          occurrence.set(id, nth + 1)
          uid = uid[nth]
        }
        uid = typeof uid === 'string' && uid ? uid : undefined
        // Provider call ids repeat. Only a durable per-occurrence uid proves
        // that a page's synthetic context is a copy of an already shown call.
        if (uid && byUid.has(uid)) return []
        const instance = { id, uid, part: toolPart(call, null, key + '-call-' + offset), settled: false }
        instance.part.providerCallId = id
        instance.part.toolCallId = uid || key + '-call-' + offset
        if (uid) byUid.set(uid, instance)
        if (id) {
          const pending = pendingById.get(id) || []
          pending.push(instance)
          pendingById.set(id, pending)
        }
        return [instance.part]
      })
      addTools(parts, key + '-tools')
    } else if (role === 'tool') {
      const uid = resultUid(row)
      // Legacy rows without uids pair sequentially within this user turn.
      // Never let the final result with a reused provider id overwrite the
      // first operation's output, and never pair across a user boundary.
      let instance = uid ? byUid.get(uid) : row.tool_call_id && pendingById.get(row.tool_call_id)?.find(call => !call.settled)
      if (!instance) {
        const call = { id: row.tool_call_id, name: row.name || row.tool_name, args: row.args }
        instance = { id: row.tool_call_id, uid, part: toolPart(call, null, key), settled: false }
        instance.part.providerCallId = row.tool_call_id
        instance.part.toolCallId = uid || key + '-result'
        if (uid) byUid.set(uid, instance)
        addTools([instance.part], key)
      }
      const result = toolPart({ name: instance.part.toolName, args: instance.part.args }, row, key)
      instance.part.result = result.result
      instance.part.outputText = result.outputText
      instance.part.completedAt = result.completedAt
      instance.part.isError = result.isError
      instance.settled = true
    } else if (role === 'user') {
      pendingById.clear()
      if (text.trim()) blocks.push({ kind: 'user', key, text, timestamp: row.timestamp })
    } else if (role === 'system' && text.trim()) {
      blocks.push({ kind: 'system', key, text, timestamp: row.timestamp })
    }
  }
  return blocks
}

// Cursor pages can repeat their boundary row; use durable row identities when
// present. Preserve distinct identical text rows if the store supplied no id.
export function mergeAgentTranscript(older, newer) {
  const seen = new Map()
  const result = []
  for (const row of [...older, ...newer]) {
    const id = row.message_uid ?? row.row_id ?? row.id
    const context = id == null && row.role === 'assistant' && !rowText(row).trim() && calls(row).length
      ? calls(row).flatMap(call => { const value = callUids(row)[callId(call)]; return Array.isArray(value) ? value : value ? [value] : [] }) : null
    const key = id != null ? JSON.stringify([row.row_kind, row.role, id])
      : context?.length ? JSON.stringify(['tool-context', context]) : null
    if (key && seen.has(key)) result[seen.get(key)] = row
    else {
      if (key) seen.set(key, result.length)
      result.push(row)
    }
  }
  return result
}
