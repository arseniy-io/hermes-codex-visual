import { agentPartDiff } from './agent-transcript-data.js'
import { describeActivity } from './chat-activity-labels.js'

export const fileDiffOpen = 'data-hcv-file-activity-open'

function nativeFileDisclosureId(tool) {
  const part = tool?.memoizedProps?.part
  if (!part) return null
  for (let context = tool.dependencies?.firstContext; context; context = context.next) {
    const client = context.memoizedValue
    if (!client?.message?.source) continue
    const id = client.message().__internal_getRuntime?.()?.getState()?.id
    if (!id) continue
    // Hermes fallback-model/targets.ts also covers older calls without a call id.
    if (part.toolCallId) return 'tool-entry:' + id + ':tool:' + part.toolCallId
    const args = JSON.stringify(part.args ?? '')
    let hash = 0
    for (let index = 0; index < args.length; index++) hash = Math.imul(31, hash) + args.charCodeAt(index)
    return 'tool-entry:' + id + ':tool:' + part.toolName + ':' + Math.abs(hash).toString(36)
  }
  return null
}

export function fileDiffDisclosure(readFiber) {
  const closing = new WeakSet()
  return row => {
    if (!row.hasAttribute('data-file-edit')) {
      closing.delete(row)
      if (row.hasAttribute(fileDiffOpen)) row.removeAttribute(fileDiffOpen)
      return
    }
    if (closing.has(row) || row.hasAttribute(fileDiffOpen)) return
    const toggle = row.querySelector(':scope > :first-child > div > button[aria-expanded="true"]:enabled')
    // The host stores intentional opens under this id. Its automatic open
    // when a diff arrives has no saved entry. Keep that distinction on remount.
    try {
      const id = nativeFileDisclosureId(readFiber(row)?.return)
      const saved = JSON.parse(localStorage.getItem('hermes.desktop.toolDisclosure.v1'))
      if (toggle && id && saved?.[id] !== true) {
        closing.add(row)
        toggle.click()
        return
      }
    } catch { /* An unknown host keeps its native disclosure available. */ }
    row.setAttribute(fileDiffOpen, '')
  }
}

function patchHeaders(text) {
  const headers = []
  let oldRemaining = 0, newRemaining = 0
  for (const line of text.split(/\r?\n/)) {
    const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line)
    if (hunk) {
      oldRemaining = Number(hunk[1] ?? 1)
      newRemaining = Number(hunk[2] ?? 1)
    } else if (oldRemaining || newRemaining) {
      if (line.startsWith('+') && newRemaining) newRemaining--
      else if (line.startsWith('-') && oldRemaining) oldRemaining--
      else if (line.startsWith(' ')) {
        oldRemaining = Math.max(0, oldRemaining - 1)
        newRemaining = Math.max(0, newRemaining - 1)
      }
    } else if (line.startsWith('--- ')) headers.push({ old: line.slice(4) })
    else if (line.startsWith('+++ ') && headers.length) headers.at(-1).new = line.slice(4)
  }
  return headers
}

// Codex 26.1117.3838.0: 154721.eecc3b7249.js nZ/ta/tn and
// 911644.2b086ab057.js x8co.S. Keep the statistics of this returned change.
export function fileActivityData(part, russian, expanded = false) {
  if (!part) return null
  const activity = describeActivity(part)
  if (activity?.kind !== 'edit' || activity.pending || activity.failed || activity.blocked || activity.paths.length !== 1) return null
  const target = part.args?.path ?? part.args?.file ?? part.args?.filepath ?? part.args?.file_path
  const path = typeof target === 'string' && target ? target : activity.paths[0]
  let result = part.result
  if (typeof result === 'string') { try { result = JSON.parse(result) } catch { result = {} } }
  const diff = agentPartDiff(part)
  const headers = patchHeaders(diff?.text || '')
  // A single native row cannot represent separate per-file counters honestly.
  if (headers.length > 1) return null
  const created = Array.isArray(result?.files_created) && result.files_created.includes(path) || headers[0]?.old === '/dev/null'
  const deleted = Array.isArray(result?.files_deleted) && result.files_deleted.includes(path) || headers[0]?.new === '/dev/null'
  const type = created ? 'add' : deleted ? 'delete' : 'update'
  const captions = russian
    ? expanded ? { add: 'Созданный файл', delete: 'Удаленный файл', update: 'Отредактированный файл' }
      : { add: 'Создано', delete: 'Удалено', update: 'Редактирование' }
    : expanded ? { add: 'Created file', delete: 'Deleted file', update: 'Edited file' }
      : { add: 'Created', delete: 'Deleted', update: 'Edited' }
  const counts = diff?.added != null && (diff.added > 0 || diff.removed > 0)
    ? { added: diff.added, removed: diff.removed } : null
  const number = new Intl.NumberFormat(russian ? 'ru' : 'en')
  return { caption: captions[type], path, name: path.split(/[\\/]/).filter(Boolean).at(-1), expanded,
    added: counts ? '+' + number.format(counts.added) : null,
    removed: counts ? '−' + number.format(counts.removed) : null,
    marker: !expanded && counts && type !== 'update' ? type : null }
}

// Both feeds use identical text/spacing and passive filename markup. Hermes
// does not export the owning openWorkspaceFile action from these tool rows.
export function fileActivityLabel(data, create) {
  if (data.expanded) return create('span', { 'data-hcv-file-activity-label': '' }, data.caption)
  return create('span', { 'data-hcv-file-activity-label': '' },
    create('span', { 'data-hcv-file-activity-text': '' }, data.caption + ' ',
      create('span', { 'data-hcv-file-activity-name': '', title: data.path }, data.name)),
    data.added && ' ', data.added && create('span', { 'data-hcv-file-activity-counts': '' },
      create('span', { 'data-hcv-file-activity-added': '' }, data.added), ' ',
      create('span', { 'data-hcv-file-activity-removed': '' }, data.removed)),
    data.marker && create('span', { 'data-hcv-file-activity-marker': data.marker, 'aria-hidden': true }))
}

export function fileActivityStyles(scope, toggle) {
  return `
${scope} [data-hcv-file-activity-native-stats] { display: none; }
${scope} [data-hcv-file-activity-label] { display: inline-flex; align-items: center; gap: 4px; min-inline-size: 0; max-inline-size: 100%; font: inherit; }
${scope} [data-hcv-file-activity-text] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${scope} [data-hcv-file-activity-name] { text-decoration: underline dotted .5px; text-underline-offset: 2px; }
${scope} [data-hcv-file-activity-counts] { display: inline-flex; flex: none; align-items: center; gap: 4px; font: inherit; font-size: calc(var(--hcv-activity-font) - 1px); line-height: 1; font-feature-settings: "cv01" on, "cv02" on; font-variant-numeric: tabular-nums; letter-spacing: -.025em; color: var(--hcv-activity-glyph); }
${scope} [data-hcv-file-activity-marker] { display: block; flex: none; inline-size: 6px; block-size: 6px; margin-inline-start: 2px; border-radius: 50%; background: color-mix(in oklab, #0285ff 70%, transparent); }
${scope} [data-hcv-file-activity-marker="delete"] { background: color-mix(in oklab, #fa423e 70%, transparent); }
@media (hover: hover) {
  ${toggle}:hover:not(:has([data-hcv-file-activity-name]:hover)) [data-hcv-file-activity-added] { color: light-dark(#00a240, #40c977); }
  ${toggle}:hover:not(:has([data-hcv-file-activity-name]:hover)) [data-hcv-file-activity-removed] { color: light-dark(#ba2623, #fa423e); }
}
`
}
