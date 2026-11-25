// Hermes Desktop lib/chat-messages/hydration.ts: isPainted,
// transcriptContent, displayContentForMessage and NOTICE_DISPLAY_KINDS.
// These exact producer markers are display contracts, not text heuristics.
const attachedContext = /(?:^|\n)--- Attached Context ---\s*\n/
const contextWarnings = /(?:^|\n)--- Context Warnings ---[\s\S]*$/
const contextRefs = /@(file|folder|url|image|tool|terminal):(?:"[^"\n]+"|'[^'\n]+'|`[^`\n]+`|\S+)/g
const heartbeat = /^\[Background process \S+ heartbeat #\d+ /
const discord = /(^|\n)\[Triggering message id: `[^`\n]*` — use as `message_id` for reply\/react\/pin via the discord tools\.\]\n*/
const machineKinds = new Set(['model_switch', 'async_delegation_complete', 'process_complete', 'auto_continue',
  'personality_switch', 'failed_turn', 'content_refused'])

function record(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { return null } }
  return value && typeof value === 'object' ? value : null
}

export function agentTranscriptPainted(row) {
  return record(row.display_metadata)?.model_only !== true
}

export function agentTranscriptRole(row) {
  return machineKinds.has(row.display_kind) ? 'system' : row.role
}

// apps/shared/src/skill-scaffold.ts, mirrored byte-for-byte marker strings.
function skillInvocation(text) {
  const prefix = '[IMPORTANT: The user has invoked the '
  if (!text.startsWith(prefix)) return null
  const name = /^\[IMPORTANT: The user has invoked the "([^"]*)"/.exec(text)?.[1]?.trim()
  if (!name) return null
  const label = name.startsWith('/') ? name : '/' + name
  const between = (marker, end, last = false) => {
    const index = last ? text.lastIndexOf(marker) : text.indexOf(marker)
    if (index < 0) return ''
    const tail = text.slice(index + marker.length)
    const stop = tail.indexOf(end)
    return (stop >= 0 ? tail.slice(0, stop) : tail).trim()
  }
  const instruction = text.includes(' skill bundle,')
    ? between('\nUser instruction: ', '\n\n[Loaded as part of the ')
    : text.includes('The full skill content is loaded below.]')
      ? between('The user has provided the following instruction alongside the skill invocation: ', '\n\n[Runtime note:', true) : ''
  return instruction ? label + ' ' + instruction.replace(/\s+/g, ' ') : label
}

export function agentTranscriptVisibleText(row, value) {
  if (row.display_kind === 'hidden') return ''
  // Native timelineDisplayContent uses typed producer metadata for machine
  // notices rather than showing the model-facing wake envelope as prose.
  if (row.display_kind === 'model_switch') return 'model changed'
  if (row.display_kind === 'auto_continue') return 'resumed interrupted turn'
  if (row.display_kind === 'personality_switch') return 'personality changed'
  if (row.display_kind === 'async_delegation_complete') {
    const metadata = record(row.display_metadata)
    if (typeof metadata?.display_text === 'string' && metadata.display_text.trim()) return metadata.display_text
    const count = metadata?.task_count
    return typeof count === 'number' ? count + ' background agent' + (count === 1 ? '' : 's') + ' finished' : 'background agent work finished'
  }
  if (row.display_kind === 'process_complete') {
    const text = record(row.display_metadata)?.display_text
    return typeof text === 'string' && text.trim() ? text : 'background process finished'
  }
  if (row.role !== 'user') return value
  if (heartbeat.test(value.trim())) return ''
  const authored = value.replace(discord, '$1')
  const invocation = skillInvocation(authored)
  if (invocation) return invocation
  const marker = authored.match(attachedContext)
  if (!marker) return authored.replace(contextWarnings, '').trim()
  const visible = authored.slice(0, marker.index).replace(contextWarnings, '').trim()
  const context = authored.slice(marker.index + marker[0].length)
  const refs = [...new Set([...context.matchAll(contextRefs)].map(match => match[0]))].filter(ref => !visible.includes(ref))
  return [refs.join('\n'), visible].filter(Boolean).join('\n\n') || visible
}
