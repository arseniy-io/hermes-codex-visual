import { createElement as h, useState } from 'react'
import { timestampSeparatorParts } from './chat-timestamp-data.js'

// Codex nMiI.r/i: separate day weight, semantic <time>, copied-text exclusion.
export function TimestampSeparator({ sentAtMs, nowMs, lang = 'ru' }) {
  const [mountedAt] = useState(Date.now)
  const value = timestampSeparatorParts(sentAtMs, lang, nowMs ?? mountedAt)
  if (!value) return null
  return h('div', { 'data-hcv-timestamp-separator': '', 'data-markdown-copy': 'exclude',
    role: 'separator', 'aria-label': value.label },
  h('time', { dateTime: value.iso }, h('span', { 'data-hcv-timestamp-day': '' }, value.date), value.join, value.time))
}

export function timestampSeparatorStyles(scope) {
  const row = scope + ' [data-hcv-timestamp-separator]'
  return `
${row} { display: flex; justify-content: center; padding-block: 16px; }
${row} > time { color: var(--hcv-agent-tertiary, light-dark(rgb(26 28 31 / 50%), rgb(255 255 255 / 50%))); font: 400 14px/20px var(--hcv-ui-font); user-select: none; }
${row} [data-hcv-timestamp-day] { font-weight: 500; }
`
}
