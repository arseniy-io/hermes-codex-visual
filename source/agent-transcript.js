import { MessageTextContent } from '@hermes/plugin-sdk'
import { fileActivityData, fileActivityLabel, fileActivityStyles } from './chat-file-activity.js'
import { createElement as h, useMemo, useState } from 'react'
import { codexIconStyle } from './codex-reference.js'
import { activityPresentation, describeActivity } from './chat-activity-labels.js'
import { copyTerminalText, terminalDetailStyles, terminalResultText } from './chat-activity-details.js'
import { agentToolArgsText, agentToolUnits } from './agent-tool-presentation.js'
import { agentPartDiff, agentTranscriptBlocks, transcriptText } from './agent-transcript-data.js'
import { agentTranscriptTurns } from './agent-transcript-turns.js'
import { TimestampSeparator, timestampSeparatorStyles } from './chat-timestamp.js'
import { TurnChangesCard, turnChangesCardStyles } from './turn-changes-card.js'

const copy = {
  ru: { copy: 'Копировать', args: 'Аргументы', result: 'Результат', success: 'Успех',
    failed: 'Ошибка', compacted: 'Контекст автоматически сжат' },
  en: { copy: 'Copy', args: 'Arguments', result: 'Result', success: 'Success',
    failed: 'Failed', compacted: 'Context automatically compacted' },
}

function Glyph({ name }) {
  return h('span', { 'data-hcv-agent-transcript-icon': name, 'aria-hidden': true, style: codexIconStyle(name) })
}

function Disclosure({ label, icon, children, shell = false, repeatKey }) {
  const [open, setOpen] = useState(false)
  return h('div', { 'data-hcv-agent-tool': '', 'data-hcv-agent-tool-icon': icon, ...(shell && { 'data-hcv-terminal-row': '' }),
    ...(repeatKey && { 'data-hcv-agent-tool-repeat': repeatKey }) },
    h('button', { type: 'button', 'data-hcv-agent-tool-toggle': '', 'aria-expanded': open,
      onClick: () => setOpen(!open) },
    h('span', { 'data-hcv-agent-tool-summary': '' },
      h(Glyph, { name: icon }), h('span', { 'data-hcv-agent-tool-label': '' }, typeof label === 'function' ? label(open) : label)),
    h('span', { 'data-hcv-agent-tool-caret': '', 'aria-hidden': true }, h(Glyph, { name: 'right' }))),
    open && children)
}

function ToolCopy({ text, target, lang }) {
  const title = lang === 'ru' ? (target === 'command' ? 'Копировать команду' : 'Копировать вывод')
    : target === 'command' ? 'Copy command' : 'Copy output'
  return h('button', { type: 'button', 'data-hcv-terminal-copy': target,
    'data-hcv-terminal-copy-owned': target, 'data-hcv-terminal-copy-label': title, 'aria-label': copy[lang].copy,
    onClick: event => { event.stopPropagation(); void copyTerminalText(event.currentTarget, text, lang === 'ru').catch(() => {}) } })
}

function Shell({ part, lang }) {
  const [expanded, setExpanded] = useState(false)
  const args = part.args || {}
  const value = args.command ?? args.code
  const command = typeof value === 'string' ? value : ''
  const hasCommand = Boolean(command.trim())
  const result = part.result
  const record = result && typeof result === 'object' ? result : {}
  const output = terminalResultText(result) ?? transcriptText(record.result ?? part.outputText)
  const exitCode = record.exit_code ?? record.exitCode
  const status = typeof exitCode === 'number' ? (exitCode === 0 ? 'success' : 'error')
    : part.isError ? 'error' : null
  const reveal = () => setExpanded(true)
  return h('div', { 'data-hcv-terminal-details': 'shell' },
    h('div', { 'data-hcv-terminal-header': '' }, 'Shell'),
    h('div', { 'data-hcv-terminal-command': '' },
      hasCommand && h('code', { 'data-hcv-terminal-code': '', ...(expanded && { 'data-hcv-terminal-expanded': '' }), role: 'button', tabIndex: 0,
        onClick: reveal, onKeyDown: event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); reveal() }
        }, 'aria-expanded': expanded }, h('span', { 'aria-hidden': true }, '$ '), command),
      status && h('span', { 'data-hcv-terminal-status': status },
        status === 'success' ? copy[lang].success
          : (lang === 'ru' ? 'Код выхода ' : 'Exit code ') + (exitCode ?? (lang === 'ru' ? 'неизвестный' : 'unknown')))),
    hasCommand && h(ToolCopy, { text: command, target: 'command', lang }),
    output && h('div', { 'data-hcv-terminal-output': '' },
      h('pre', null, output)),
    output && h(ToolCopy, { text: output, target: 'output', lang }))
}

function RawResult({ part, lang }) {
  const diff = agentPartDiff(part)
  const argsText = agentToolArgsText(part)
  return h('div', { 'data-hcv-agent-tool-detail': '' },
    diff && h('pre', { 'data-hcv-agent-file-diff': '', tabIndex: 0 }, diff.text),
    argsText && h('section', { 'data-hcv-agent-tool-args': '' }, h('p', null, copy[lang].args), h('pre', null, argsText)),
    part.outputText !== undefined && h('section', null,
      h('p', null, copy[lang].result), h('pre', null, part.outputText)))
}

function Tool({ part, lang, nested = false }) {
  const data = describeActivity(part)
  const view = activityPresentation([part], data?.pending === true, lang === 'ru', nested)
  const path = data?.paths?.map(value => value.split(/[\\/]/).at(-1)).join(', ')
  const diff = data?.kind === 'edit' ? agentPartDiff(part) : null
  const counts = diff?.added != null ? ' +' + diff.added + ' −' + diff.removed : ''
  // The Russian locale has no nestedCommandUnsuccessful entry; Codex keeps
  // the default English failed-command caption inside an opened group.
  const fallback = data?.kind === 'command' && data.failed && data.command
    ? 'Command failed (' + data.command + ')' : part.toolName
  const file = fileActivityData(part, lang === 'ru')
  const label = file ? open => fileActivityLabel(fileActivityData(part, lang === 'ru', open), h)
    : (view?.label || (view?.prefix && path ? view.prefix + path : fallback)) + counts
  return h(Disclosure, { label, icon: view?.icon || data?.icon || 'activityIntegration', shell: data?.kind === 'command' },
    data?.kind === 'command' ? h(Shell, { part, lang }) : h(RawResult, { part, lang }))
}

function RepeatedTools({ unit, lang }) {
  return h(Disclosure, { label: unit.view.label, icon: unit.view.icon, repeatKey: unit.view.key },
    h('div', { 'data-hcv-agent-tool-children': '' },
      unit.parts.map(part => h(Tool, { key: part.toolCallId, part, lang, nested: true }))))
}

function Tools({ parts, lang }) {
  if (parts.length === 1) return h(Tool, { part: parts[0], lang })
  const units = agentToolUnits(parts, lang === 'ru')
  const live = parts.some(part => describeActivity(part)?.pending)
  const view = activityPresentation(parts, live, lang === 'ru', false, true)
  return h(Disclosure, { label: view?.label || parts.map(part => part.toolName).join(', '),
    icon: view?.icon || 'activityIntegration' },
  h('div', { 'data-hcv-agent-tool-children': '' },
    units.map(unit => unit.view
      ? h(RepeatedTools, { key: unit.key, unit, lang })
      : h(Tool, { key: unit.key, part: unit.parts[0], lang, nested: true }))))
}

export function AgentTranscript({ rows, lang, durationLabel, nowMs, historyComplete = true,
  changes = [], sameOwner, onReview, onApply, onResult, onError }) {
  const groups = useMemo(() => agentTranscriptTurns(rows, { nowMs, historyComplete }).map(group => ({
    ...group, blocks: agentTranscriptBlocks(group.rows, { lang }),
  })), [rows, nowMs, historyComplete, lang])
  return h('div', { 'data-hcv-agent-transcript': '' }, groups.map(group => {
    if (!group.blocks.length) return null
    const user = group.rows.find(row => row.role === 'user' && row.display_kind !== 'hidden')
    const userKey = user && String(user.message_uid ?? user.row_id ?? user.id)
    const snapshot = changes.find(value => value.turnId === userKey)
    const final = group.blocks.findLast(block => block.kind === 'assistant')?.key
    const timing = group.finalMetadata
    const seconds = timing && Number.isFinite(timing.completedAtMs) && timing.completedAtMs >= timing.turnStartedAtMs
      ? Math.floor((timing.completedAtMs - timing.turnStartedAtMs) / 1000) : null
    const hours = seconds == null ? 0 : Math.floor(seconds / 3600)
    const minutes = seconds == null ? 0 : Math.floor(seconds / 60) % 60
    const elapsed = seconds == null ? null : [hours && hours + 'h', (hours || minutes) && minutes + 'm', seconds % 60 + 's'].filter(Boolean).join(' ')
    const worked = elapsed ? (lang === 'ru' ? 'Работал на протяжении ' : 'Worked for ') + elapsed
      : groups.filter(item => item.blocks.length).length === 1 ? durationLabel : null
    return (
    h('div', { key: group.key, 'data-hcv-agent-turn': group.turnId || group.key },
      group.timestampSeparatorAtMs != null && h(TimestampSeparator, {
        sentAtMs: group.timestampSeparatorAtMs, nowMs, lang,
      }),
      h('div', { 'data-hcv-agent-turn-body': '' }, group.blocks.map(block => {
        if (block.kind === 'tools') return h(Tools, { key: block.key, parts: block.parts, lang })
        if (block.kind === 'compaction') return h(Disclosure, { key: block.key,
          label: copy[lang].compacted, icon: 'memory' },
        h('div', { 'data-hcv-agent-tool-detail': '' }, h(MessageTextContent, { text: block.text, previewOnly: true })))
        return h('div', { key: block.key, 'data-hcv-agent-message': block.kind, dir: 'auto' },
          block.key === final && worked && h('p', { 'data-hcv-subagent-meta': '' }, worked),
          // Text is rendered by Hermes in preview mode, retaining child ownership.
          h(MessageTextContent, { text: block.text, previewOnly: true }))
      })), snapshot && h(TurnChangesCard, { key: snapshot.snapshotId, snapshot, lang, sameOwner, onReview, onApply, onResult, onError })))
  }))
}

export function agentTranscriptStyles(pane) {
  const transcript = pane + ' [data-hcv-agent-transcript]'
  const row = transcript + ' [data-hcv-agent-tool]'
  const toggle = row + ' > [data-hcv-agent-tool-toggle]'
  return `
${pane} { --hcv-activity-foreground: light-dark(#1a1c1f, #dfdfdf); --hcv-activity-glyph: color-mix(in oklab, var(--hcv-activity-foreground) 60%, transparent); --hcv-activity-font: var(--codex-chat-font-size, 14px); --hcv-activity-line: calc(var(--hcv-activity-font) * 1.5); --hcv-activity-text: light-dark(rgb(26 28 31 / 50%), rgb(255 255 255 / 50%)); --hcv-activity-border: light-dark(rgb(26 28 31 / 8%), rgb(255 255 255 / 8%)); --hcv-activity-mono: var(--hcv-mono-font); }
${transcript} { display: flex; flex-direction: column; gap: 16px; min-inline-size: 0; }
${transcript} [data-hcv-agent-turn] { min-inline-size: 0; }
${transcript} [data-hcv-agent-turn-body] { display: flex; flex-direction: column; gap: 16px; min-inline-size: 0; }
${timestampSeparatorStyles(transcript)}
${turnChangesCardStyles(transcript)}
/* Codex vHM0 / A5BN bubble (non-Aeon): 70%, 5.5*4px radius,
   py-2.5 and px-thread-content-margin=4*4px. */
${transcript} [data-hcv-agent-message="user"] { align-self: flex-end; max-inline-size: 70%; padding: 10px 16px; border-radius: 22px; corner-shape: superellipse(1.5); background: color-mix(in oklab, var(--hcv-activity-foreground) 5%, transparent); }
${transcript} [data-hcv-agent-message] { min-inline-size: 0; }
${transcript} .aui-md { --conversation-text-font-size: var(--codex-chat-font-size, 14px); --dt-line-height: 1.625; }
${row} { min-inline-size: 0; --hcv-activity-glyph: color-mix(in oklab, var(--hcv-activity-foreground) 60%, transparent); }
${toggle} { display: flex; align-items: center; gap: 4px; inline-size: fit-content; max-inline-size: 100%; min-inline-size: 0; padding: 0; background: transparent; border: 0; text-align: start; color: var(--hcv-activity-text, var(--hcv-agent-tertiary)); font: 430 14px/21px var(--hcv-ui-font); cursor: pointer; }
${row} [data-hcv-agent-transcript-icon] { display: inline-block; flex: none; inline-size: 16px; block-size: 16px; margin-block-start: 0; color: var(--hcv-activity-glyph); }
${row}:is([data-hcv-agent-tool-icon="activityIntegration"], [data-hcv-agent-tool-icon="activityGithub"]) { --hcv-activity-glyph: var(--hcv-activity-text); }
${toggle} > [data-hcv-agent-tool-summary] { display: inline-flex; align-items: center; gap: 8px; min-inline-size: 0; overflow: hidden; }
${toggle} [data-hcv-agent-tool-label] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${toggle} > [data-hcv-agent-tool-caret] { display: inline-flex; align-items: center; flex: none; opacity: 0; transform: rotate(0deg); }
${toggle}:is(:hover, :focus-visible, [aria-expanded="true"]) > [data-hcv-agent-tool-caret] { opacity: 1; }
${toggle}[aria-expanded="true"]:not([data-hcv-activity-motion="closing"]) > [data-hcv-agent-tool-caret] { transform: rotate(90deg); }
${toggle} > [data-hcv-agent-tool-caret] > span { inline-size: 14px; block-size: 14px; margin-block-start: 0; }
${toggle}:hover { color: var(--hcv-activity-foreground); }
${row} > [data-hcv-agent-tool-children] { display: flex; flex-direction: column; position: relative; gap: 12px; margin: 0; padding-block-start: 12px; padding-inline-start: 24px; }
${row} > [data-hcv-agent-tool-children]::before { content: ''; position: absolute; pointer-events: none; inset-block: 12px 0; inset-inline-start: 8px; border-inline-start: 1px solid var(--hcv-activity-border); }
${transcript} :not(button)[data-hcv-activity-motion] { box-sizing: border-box; min-block-size: 0; overflow: hidden; }
${transcript} :not(button)[data-hcv-activity-motion="closing"] { pointer-events: none; }
@media (prefers-reduced-motion: no-preference) { ${toggle} > [data-hcv-agent-tool-caret] { transition: transform 300ms cubic-bezier(.4,0,.2,1); } }
@media (prefers-reduced-motion: reduce) { ${toggle} > [data-hcv-agent-tool-caret] { transition: none; } }
${row} > [data-hcv-agent-tool-detail] { margin: 12px 0 0 24px; min-inline-size: 0; overflow: auto; }
${row} [data-hcv-agent-tool-detail] section + section { margin-block-start: 12px; }
${row} [data-hcv-agent-tool-detail] p { margin: 0 0 4px; color: var(--hcv-agent-tertiary); }
${row} [data-hcv-agent-tool-detail] pre { max-block-size: 400px; overflow: auto; margin: 0; white-space: pre; font: 400 12px/20px var(--hcv-mono-font); }
${fileActivityStyles(transcript, toggle)}
${terminalDetailStyles(transcript + ' [data-hcv-terminal-details="shell"]', row + '[data-hcv-terminal-row]')}
`
}
