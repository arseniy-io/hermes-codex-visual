import { mountStyle } from './style-scope.js'
import { fileActivityData, fileActivityLabel, fileActivityStyles } from './chat-file-activity.js'
import { codexIconRules, codexMask, codexReference as codex } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'
import { observeChatText } from './chat-text-observation.js'
import { agentDisplayName } from './agent-display-name.js'
import { registerChatImages } from './chat-images.js'
import { registerChatReasoning } from './chat-reasoning.js'
import { registerChatSkills } from './chat-skills.js'
import { activityPresentation, activityToolPart } from './chat-activity-labels.js'
import { clearActivityDetails, registerActivityDetails, updateActivityDetails } from './chat-activity-details.js'
import { activityGroup, activityGroups, activityMember, activityRepeatGroup, activityRepeatMember, emptyActivityOwner } from './chat-activity-groups.js'
import { disclosureMotion, registerDisclosureMotion } from './chat-disclosure-motion.js'
import { workMotionPanels } from './completed-turn-disclosure.js'

const surface = '[data-chat-surface]:not([data-hud-shell] *)'
const rowSelector = '[data-tool-row][data-slot="tool-block"]'
const summarySelector = '[data-tool-group] > [data-tool-summary]'
const activitySelector = `${rowSelector}, ${summarySelector}`
const responseSelector = '[data-slot="aui_response-group"]'
const messageContent = '[data-slot="aui_assistant-message-content"]'
const thinkingSelector = '[data-slot="aui_thinking-disclosure"]'
const thinkingBody = '[data-slot="aui_thinking-body"]'
const receiptSelector = '[data-slot="aui_system-message-root"] [data-slot="aui_background-result"]'
const labelSelector = `${activitySelector}, ${thinkingSelector}, ${receiptSelector}`
const iconAttribute = 'data-hcv-activity-icon'
const nativeLabel = 'data-hcv-activity-native-label'
const customLabel = 'data-hcv-activity-label'
const editPrefix = 'data-hcv-activity-edit-prefix'
const favicon = 'data-hcv-activity-favicon'
const fallbackIcon = 'data-hcv-activity-fallback-icon'
const failedHeader = 'data-hcv-activity-failed'
const toolIcons = new Map([
  ['terminal', 'activityTerminal'], ['execute_code', 'activityTerminal'],
  ['read_file', 'activityRead'], ['list_files', 'activityList'], ['skill_view', 'activitySkill'],
  ['search_files', 'activitySearch'], ['web_search', 'activitySearch'], ['session_search_recall', 'activitySearch'],
  ['write_file', 'activityEdit'], ['edit_file', 'activityEdit'], ['patch', 'activityEdit'],
  ['vision_analyze', 'activityImage'], ['image_generate', 'activityImage'],
])

function nativeIcon(entry, part) {
  if (entry.hasAttribute('data-tool-summary')) {
    // ToolRunHeader receives the native, category-ordered run summary.
    // These verbs are constants in Hermes run-summary.ts, independent of locale.
    const verb = entry.querySelector('button')?.textContent.trim().split(/\s/, 1)[0]
    if (['Edited', 'Editing'].includes(verb)) return 'activityEdit'
    if (['Explored', 'Exploring'].includes(verb)) return 'activityRead'
    if (['Ran', 'Running'].includes(verb)) return 'activityTerminal'
    if (['Used', 'Using'].includes(verb)) return 'activityIntegration'
    return null
  }
  const name = part?.toolName
  return toolIcons.get(name) ?? (name?.startsWith('mcp_') ? 'activityIntegration' : null)
}

function runParts(summary) {
  // ToolRun has its slice indices even while the individual rows are unmounted.
  // Read that message's scope, which also works for background chat panes.
  let first, last
  for (let fiber = committedFiber(summary.parentElement); fiber; fiber = fiber.return) {
    if (fiber.stateNode instanceof Element && fiber.stateNode.hasAttribute('data-role')) break
    const props = fiber.memoizedProps
    if (first === undefined && Number.isInteger(props?.startIndex) && Number.isInteger(props?.endIndex)) {
      first = Math.max(0, props.startIndex)
      last = props.endIndex
    }
    if (first === undefined) continue
    for (let context = fiber.dependencies?.firstContext; context; context = context.next) {
      const client = context.memoizedValue
      if (!client?.message?.source) continue
      try {
        const { content } = client.message().__internal_getRuntime()?.getState() || {}
        if (Array.isArray(content)) return content.slice(first, last + 1).filter(part => part.type === 'tool-call')
      } catch { /* A detached or unrecognized message scope keeps native copy. */ }
    }
  }
  return []
}

const rowProps = row => {
  const props = committedFiber(row)?.return?.memoizedProps
  return props?.part ? { ...props, part: activityToolPart(props.part) } : props
}
const directSummary = ':scope > [data-tool-summary]'
function partsForBlock(block, readRow, readRun) {
  if (block.matches(rowSelector)) {
    const part = readRow(block)?.part
    return part?.toolName ? [part] : []
  }
  if (!block.matches('[data-tool-group]')) return []
  const summary = block.querySelector(directSummary)
  if (summary) return readRun(summary)
  const row = block.querySelector(`:scope > div > ${rowSelector}`)
  return row ? partsForBlock(row, readRow, readRun) : []
}

const findTitle = (entry, summary) => (summary ? entry : entry.firstElementChild)
  ?.querySelector(':scope > div > button > span:first-child > span:first-child')

function thoughtLabel(text) {
  if (text === 'Thinking' || text === 'Думает') return 'Думаю'
  if (['Помыслил', 'Кратко подумал', 'Thought', 'Thought briefly'].includes(text)) return 'Думал'
  if (text.startsWith('Думал ') && !text.startsWith('Думал на протяжении ')) {
    return 'Думал на протяжении ' + text.slice('Думал '.length)
  }
  return ''
}

const receiptStatuses = new Map([
  ['Completed', ['завершил(-и) работу', 'завершил(-и) работу']],
  ['Finished with Issues', ['завершил(-и) работу с ошибками', 'завершил(-и) работу с ошибками']],
  ['Failed', ['завершил(-и) работу с ошибками', 'завершил(-и) работу с ошибками']],
  ['Incomplete', ['не завершил работу', 'не завершили работу']],
  ['Interrupted', ['прервал работу', 'прервали работу']],
  ['Cancelled', ['отменил задачу', 'отменили задачи']],
  ['Timed Out', ['не уложился во время', 'не уложились во время']],
  ['Stalled', ['остановился', 'остановились']],
])
let receiptSubjects

function receiptLabel(text) {
  const match = /^Subagent (Task|Tasks) ([^:]+): (.+)$/.exec(text)
  if (!match) return ''
  const [, kind, outcome, goal] = match
  const plural = kind === 'Tasks'
  if (outcome === 'Unknown') return (plural ? 'Статус субагентов' : 'Статус субагента') + ' неизвестен'
  const status = receiptStatuses.get(outcome)?.[Number(plural)]
  if (!status) return ''
  const goals = plural ? goal.replace(/ \(\d+ tasks\)$/, '').split('; ') : [goal]
  receiptSubjects ??= new Intl.ListFormat('ru')
  const subject = receiptSubjects.format(goals.map(goal => agentDisplayName({ goal }, 'Субагент')))
  return subject + ' ' + status
}

export function registerChatActivity(ctx, active) {
  const chat = `${active} ${surface}`
  const row = `${chat} ${rowSelector}`
  const summary = `${chat} ${summarySelector}`
  const group = `${chat} [data-tool-group][data-slot="tool-block"]`
  const response = `${chat} [data-slot="aui_response-group"]`
  const assistant = '[data-slot="aui_assistant-message-root"]'
  const scaffold = ':is([data-slot="tool-block"], [data-slot="aui_thinking-disclosure"], [data-slot="aui_turn-activity"])'
  // Hermes does not know about the plugin's own activity headers or agent
  // rows. Count only visible, top-level items when assigning their spacing.
  const flow = `:is(${scaffold}, .aui-md, [${activityGroup}], [data-hcv-agent-rows])` +
    `:not([${activityMember}="closed"]):not([data-delegate-card])`
  const toggle = `:is(${row} > :first-child, ${summary}) > div > button`
  const title = `${toggle} > span:first-child > span:first-child`
  const glyph = `${title} > span:first-child:has(> :is(svg, .codicon, [role="status"]))`
  const thinking = `${chat} ${thinkingSelector}`
  const receipt = `${chat} ${receiptSelector}`
  const thoughtToggle = `${thinking} > div:first-child > button`
  const receiptToggle = `${receipt} > [data-conversation-scaffold] > div > button`
  const overall = `${chat} :is([${activityGroup}], [${activityRepeatGroup}])`
  const overallToggle = `${overall} > button`
  const turnToggle = `${chat} button[data-hcv-turn-line]`
  const controls = `:is(${toggle}, ${thoughtToggle}, ${receiptToggle}, ${overallToggle})`
  const caretBox = `${controls}[aria-expanded] > span:nth-child(2)`
  const caret = `:is(${caretBox} > .codicon-chevron-right, ${overallToggle} > span:nth-child(2))`
  const childToggle = `${active} [data-hcv-subagents-pane] [data-hcv-agent-tool-toggle]`
  const motionPanel = `:is(${chat} :not(button)[${disclosureMotion}], ${active} [data-hcv-subagents-pane] :not(button)[${disclosureMotion}])`
  const children = `${summary}:has(button[aria-expanded="true"]) + div:not([data-tool-ticker])`
  const clusterMember = `${chat} [${activityMember}]:not([${activityMember}="closed"])`
  const repeatMember = `${chat} [${activityRepeatMember}]:not([${activityRepeatMember}="closed"])`
  const clusterChildren = `${clusterMember}[data-tool-group] > [data-tool-summary]:has(button[aria-expanded="true"]) + div:not([data-tool-ticker])`
  const output = `${row}[data-tool-open]:not([data-file-edit]) > :nth-child(2)`
  const preview = `${output} > div:has(> [data-slot="aui_markdown-image"])`
  const thumb = `${preview} [data-slot="aui_markdown-image"]:has(img)`
  const copy = `${output} > button[class~="group-hover/tool-block:opacity-100"]`
  const icons = [...new Set([...toolIcons.values(), 'activityIntegration', 'activityGithub', 'activityBrowser', 'chatSkill'])]

  const style = document.createElement('style')
  style.setAttribute('data-hcv-chat-activity-style', '')
  style.textContent = `
@media (forced-colors: none) {
  ${chat} {
    --hcv-activity-foreground: light-dark(#1a1c1f, #dfdfdf);
    --hcv-activity-text: light-dark(rgb(26 28 31 / 50%), rgb(255 255 255 / 50%));
    --hcv-activity-glyph: color-mix(in oklab, var(--hcv-activity-foreground) 60%, transparent);
    --hcv-activity-border: light-dark(rgb(26 28 31 / 8%), rgb(255 255 255 / 8%));
    --hcv-activity-font: var(--codex-chat-font-size, 14px);
    --hcv-activity-line: calc(var(--hcv-activity-font) * 1.5);
    --hcv-activity-mono: var(--hcv-mono-font);
  }
  :is(${row}, ${summary}) {
    --conversation-tool-font-size: var(--hcv-activity-font);
    --conversation-scaffold-text: var(--hcv-activity-text);
    --conversation-scaffold-meta: var(--hcv-activity-text);
    --ui-text-tertiary: var(--hcv-activity-text);
    opacity: 1;
    font-family: ${codex.font};
    font-weight: 430;
    line-height: 1.5;
  }
  ${row}:not([data-file-edit]), ${row}:not([data-file-edit]) > :first-child {
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  /* Direct file rows also belong to the outer 12px activity sequence.
     Reset ordinary native padding without overriding that sequence. */
  ${row}:not([data-file-edit]):not([${activityMember}]), ${row}:not([data-file-edit]) > :first-child {
    padding: 0;
  }
  /* In Codex, separate conversation items use 16px. The smaller 4px gap is
     for explicitly grouped items, not neighbouring agent/tool entries. */
  ${chat} ${messageContent} { --turn-block-gap: 16px; --scaffold-block-gap: 16px; }
  ${chat} ${messageContent} > ${flow} { margin-block-start: 16px; }
  ${chat} ${messageContent} > ${flow}:nth-child(1 of ${flow}) { margin-block-start: 0; }
  ${chat} ${messageContent} > .aui-md + .aui-md { margin-block-start: var(--paragraph-gap); }
  ${response} { row-gap: 16px; }
  ${response} > ${assistant}[${emptyActivityOwner}] { display: none; }
  /* An interim response may retain Hermes's invisible footer while a later
     activity root is still running. Restore it when that turn finishes. */
  ${response}:has([data-message-streaming="true"], [data-slot="aui_response-loading"],
    [data-slot="aui_turn-activity"][data-state="active"], [data-hcv-live-turn])
    > ${assistant}:has(~ ${assistant} > ${messageContent} > ${scaffold})
    > div:has(> div > [data-slot="aui_msg-actions"]) { display: none; }
  ${group} { --tool-row-gap: 0px; }
  ${children} {
    position: relative; gap: 12px;
    padding-block-start: 12px; padding-inline-start: 24px;
  }
  ${children}::before, ${clusterMember}::before, ${repeatMember}::before {
    content: ""; position: absolute; pointer-events: none;
    inset-block: 12px 0; inset-inline-start: 8px;
    border-inline-start: 1px solid var(--hcv-activity-border);
  }
  ${controls} { align-items: center; gap: 4px; padding: 0; border-radius: 6px; }
  ${controls}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  /* ToolEntry's far-right dismiss action has no counterpart in Codex tool
     rows. Hide only its action slot; keep the disclosure, time and output. */
  ${row} > :first-child > div > span:has(> button > .codicon-close) { display: none; }
  ${toggle}:not(:disabled):is(:hover, :focus-visible) { --conversation-scaffold-text: var(--hcv-activity-foreground); }
  ${title} { gap: 8px; }
  ${glyph} { inline-size: 16px; block-size: 16px; color: var(--hcv-activity-glyph); }
  /* ConnectorTool's presentation caption can omit ToolGlyph altogether.
     Use the same resolved Codex asset when there is no native glyph slot. */
  ${row}[${iconAttribute}] [${fallbackIcon}]:not(:has(> img[${favicon}]))::before {
    content: ""; inline-size: 16px; block-size: 16px; flex: none;
    background: var(--hcv-activity-glyph); mask: var(--hcv-activity-icon) center / contain no-repeat;
  }
  ${chat} [${nativeLabel}] { display: none; }
  ${title} > [${customLabel}] {
    display: block; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: var(--hcv-activity-font); line-height: 1.5; color: var(--conversation-scaffold-text);
  }
  ${title} > [${editPrefix}]::before { content: attr(${editPrefix}); }
  :is(${thoughtToggle}, ${receiptToggle}, ${overallToggle}) {
    --conversation-tool-font-size: var(--hcv-activity-font);
    --conversation-line-height: var(--hcv-activity-line);
    font: 430 var(--hcv-activity-font)/var(--hcv-activity-line) ${codex.font};
  }
  ${thinking} { opacity: 1; }
  ${thoughtToggle} { --conversation-scaffold-text: color-mix(in oklab, var(--hcv-chat-prose, var(--hcv-text)) 30%, transparent); }
  ${thinking} > div:first-child > span:last-child span[class~="tabular-nums"] {
    font: 430 var(--hcv-activity-font)/var(--hcv-activity-line) ${codex.font};
    color: color-mix(in oklab, var(--hcv-chat-prose, var(--hcv-text)) 30%, transparent);
    letter-spacing: normal;
  }
  ${thoughtToggle}:is(:hover, :focus-visible) {
    --conversation-scaffold-text: var(--hcv-chat-prose, var(--hcv-text)) !important;
  }
  ${receipt} { --conversation-scaffold-text: var(--hcv-activity-text); }
  /* BackgroundResult adds 4px above and below its row. Subagent receipts
     participate in the same 16px timeline spacing as the other items. */
  ${receipt}:has([${customLabel}]) { padding-block: 0; }
  ${receipt} > [data-conversation-scaffold] { opacity: 1; }
  :is(${thoughtToggle}, ${receiptToggle}) [${customLabel}] {
    min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--conversation-scaffold-text);
  }
  ${title} > img[${favicon}] {
    inline-size: 16px; block-size: 16px; flex: none; border-radius: 4px; object-fit: contain;
  }
  ${title}:has(> img[${favicon}]) > span:first-of-type:has(> :is(svg[aria-hidden="true"], .codicon)) { display: none; }
  ${glyph} > :is(svg, .codicon):not([aria-label]) { color: inherit; }
  /* Keep the live status accessible, but use the same browser glyph before
     and after completion instead of Hermes' animated decorative frames. */
  ${glyph}:is(${row}[${iconAttribute}="activityBrowser"] *):has(> [role="status"]) {
    background: var(--hcv-activity-glyph);
    mask: var(--hcv-activity-icon) center / contain no-repeat;
  }
  ${glyph}:is(${row}[${iconAttribute}="activityBrowser"] *) > [role="status"] > .glyph-spinner {
    opacity: 0;
  }
  ${caretBox} { opacity: 0; flex: none; }
  ${controls}[aria-expanded="true"]:not([${disclosureMotion}="closing"]) > span:nth-child(2),
  ${controls}[aria-expanded]:is(:hover, :focus-visible) > span:nth-child(2) { opacity: 1; }
  ${controls}[aria-expanded="true"]:not([${disclosureMotion}="closing"]) { --hcv-arrow-angle: 90deg; }
  ${caret} {
    inline-size: 14px !important; block-size: 14px !important; color: var(--hcv-activity-glyph);
    rotate: none; transform: rotate(var(--hcv-arrow-angle, 0deg));
  }
  ${thoughtToggle}[aria-expanded] > span:nth-child(2) > .codicon-chevron-right { color: var(--hcv-activity-text); }
  ${thoughtToggle}:focus-visible > span:nth-child(2) > .codicon-chevron-right { color: var(--hcv-chat-prose, var(--hcv-text)); }
  ${codexIconRules(caret, 'turnDisclosure')}
  ${turnToggle}[${disclosureMotion}="closing"][aria-expanded="true"]::after { transform: rotate(0deg); }
  ${motionPanel} { box-sizing: border-box; min-block-size: 0; overflow: hidden; }
  ${motionPanel}[${disclosureMotion}="closing"] { pointer-events: none; }
  ${overall} { opacity: 1; color: var(--hcv-activity-text); }
  ${overallToggle} { display: inline-flex; max-inline-size: 100%; text-align: start; cursor: pointer; }
  ${overallToggle}:is(:hover, :focus-visible) { color: var(--hcv-activity-foreground); }
  ${overallToggle} > span:first-child {
    display: flex; align-items: center; gap: 8px; min-inline-size: 0; overflow: hidden;
  }
  ${overallToggle} > span:first-child > span {
    min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  ${overallToggle} > span:first-child::before {
    content: ""; inline-size: 16px; block-size: 16px; flex: none;
    background: var(--hcv-activity-glyph); mask: var(--hcv-activity-icon) center / contain no-repeat;
  }
  ${overallToggle} > span:first-child > img[${favicon}] {
    inline-size: 16px; block-size: 16px; flex: none; border-radius: 4px; object-fit: contain;
  }
  ${overallToggle} > span:first-child:has(> img[${favicon}])::before { display: none; }
  ${chat} :is([${activityMember}="closed"], [${activityRepeatMember}="closed"]) { display: none; }
  ${clusterMember} {
    position: relative; margin-block: 0 !important;
    padding-block: 12px 0; padding-inline: 24px 0 !important;
  }
  ${clusterMember}[${activityMember}="next"]::before { inset-block-start: 0; }
  /* Native ToolRun already supplies the 12px row gap inside a repeat. */
  ${repeatMember} {
    position: relative; margin-block: 0 !important;
    padding-block: 0 !important; padding-inline: 24px 0 !important;
  }
  ${repeatMember}::before { inset-block: 0; }
  ${repeatMember}[${activityRepeatMember}="next"]::before { inset-block-start: -12px; }
  ${clusterMember} > [data-tool-summary]:has(button[aria-expanded="true"]) { display: none; }
  ${clusterChildren} { padding: 0; }
  ${clusterChildren}::before { content: none; }
  ${fileActivityStyles(chat, toggle)}
  ${icons.map(icon => `
    ${chat} :is([${iconAttribute}="${icon}"], [${activityGroup}="${icon}"], [${activityRepeatGroup}="${icon}"]) { --hcv-activity-icon: ${codexMask(icon)}; }
  `).join('')}
  /* gSvk server marks use text-tertiary; terminal and other default glyphs
     retain pmt2's text/60 token. */
  ${chat} :is([${iconAttribute}="activityIntegration"], [${iconAttribute}="activityGithub"],
    [${activityGroup}="activityIntegration"], [${activityGroup}="activityGithub"],
    [${activityRepeatGroup}="activityIntegration"], [${activityRepeatGroup}="activityGithub"]) {
    --hcv-activity-glyph: var(--hcv-activity-text);
  }
  ${glyph}:is(${row}[${iconAttribute}] *) > :is(svg[aria-hidden="true"], .codicon):not([aria-label]) {
    inline-size: 16px !important;
    block-size: 16px !important;
    background-color: currentColor;
    mask: var(--hcv-activity-icon) center / contain no-repeat;
  }
  ${glyph}:is(${row}[${iconAttribute}] *) > svg[aria-hidden="true"] > *,
  ${glyph}:is(${row}[${iconAttribute}] *) > .codicon:not([aria-label])::before { visibility: hidden; }
  :is(
    ${title}:is(${summary}[${iconAttribute}] *),
    ${title}:is(${row}[${iconAttribute}] *):not(:has(> span:first-child > :is(svg, .codicon, [role="status"])))
  ):not(:has(> img[${favicon}]))::before {
    content: "";
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    background: var(--hcv-activity-glyph);
    mask: var(--hcv-activity-icon) center / contain no-repeat;
  }
  /* Known failed MCP/command headers keep the category glyph in Codex.
     Preserve the native accessible failure label and the error details. */
  ${glyph}:is(${row}[${failedHeader}] *) > svg[aria-label] {
    inline-size: 16px !important;
    block-size: 16px !important;
    color: var(--hcv-activity-glyph) !important;
    background-color: currentColor;
    mask: var(--hcv-activity-icon) center / contain no-repeat;
  }
  ${glyph}:is(${row}[${failedHeader}] *) > svg[aria-label] > * { visibility: hidden; }
  ${output} { margin-block-start: 4px; padding: 0; gap: 4px; }
  /* Source/config previews use code size. PuGl's shell transcript has its
     separate chat-sm role in registerActivityDetails. */
  ${output} :is(pre, code, .font-mono) { font-family: var(--hcv-activity-mono); font-size: ${codex.typography.code}px; line-height: 1.5; }
  ${output} pre, ${output} > .font-mono {
    border: 0;
    border-radius: 6px;
    background: var(--hcv-hover);
    padding: 8px 12px;
  }
  ${output}:has(> button) pre, ${output}:has(> button) > .font-mono { padding-inline-end: 36px; }
  ${output} > button { inset-block-start: 4px; inset-inline-end: 8px; color: var(--hcv-activity-text); }
  /* PuGl in 461952.bb4069593d.js uses a hover/focus copy action with duration-basic. */
  ${codexIconRules(`${copy} > svg.tabler-icon-copy`, 'copy')}
  ${codexIconRules(`${copy} > svg.tabler-icon-check`, 'messageCopied')}
  @media (hover: hover) {
    ${copy} { opacity: 0; }
    ${output}:hover > button[class~="group-hover/tool-block:opacity-100"], ${copy}:focus-visible { opacity: 1; }
  }
  @media (hover: none) { ${copy} { opacity: 1; } }
  @media (prefers-reduced-motion: no-preference) {
    ${copy} { transition: opacity 150ms var(--hcv-ease); }
    ${caret} { transition: transform 300ms cubic-bezier(.4,0,.2,1); }
  }
  ${preview} { border: 0; border-radius: 0; }
  ${thumb} {
    inline-size: 80px !important;
    block-size: 80px;
    aspect-ratio: 1 !important;
    margin: 0;
    border: 1px solid light-dark(#0d0d0d26, #ffffff33);
    border-radius: 10px;
  }
  ${thumb} > span { inline-size: 100%; block-size: 100%; }
  ${thumb} img { inline-size: 100%; block-size: 100%; object-fit: cover; border-radius: 8px; box-shadow: none; }
  ${thumb} [data-slot="aui_zoomable-image"] > button:has(> svg.tabler-icon-download) {
    inset-inline-end: 4px;
    inset-block-start: 4px;
    inline-size: 24px;
    block-size: 24px;
  }
  ${thumb} :focus-visible, ${thumb} button:focus-visible > img { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  @media (prefers-reduced-motion: reduce) { :is(${caret}, ${copy}) { transition: none; } }
}
`
  mountStyle(ctx, style, { surface: `[data-slot="tool-block"], ${thinkingSelector}, ${receiptSelector}, [data-hcv-agent-rows]` })

  const pending = new Set()
  const pendingResponses = new Set()
  // Group captions and individual entries use the same committed metadata
  // within a pass. Read it again on the next pass in case React has updated it.
  const rowReads = new Map()
  const runReads = new Map()
  const readRow = entry => {
    if (!rowReads.has(entry)) rowReads.set(entry, rowProps(entry))
    return rowReads.get(entry)
  }
  const readRun = entry => {
    if (!runReads.has(entry)) runReads.set(entry, runParts(entry))
    return runReads.get(entry)
  }
  function clearReads() {
    rowReads.clear()
    runReads.clear()
  }
  const groups = activityGroups(block => partsForBlock(block, readRow, readRun), (...args) => setSite(...args), clearReads)
  const siteEntries = new WeakMap()
  const siteIcons = new Map()
  const forcedColors = window.matchMedia('(forced-colors: active)')
  const enabled = () => document.documentElement.matches(active) && !forcedColors.matches
  registerDisclosureMotion(ctx, enabled, button => {
    if (button.matches(childToggle)) return [...button.parentElement.children].slice(1)
    if (button.matches(overallToggle)) return groups.panels(button)
    if (button.matches(turnToggle)) return workMotionPanels(button)
    if (!button.matches(`:is(${toggle}, ${thoughtToggle}, ${receiptToggle})`)) return null
    const header = button.closest(`:is(${rowSelector}, [data-tool-summary], ${thinkingSelector}, ${receiptSelector})`)
    if (header.matches('[data-tool-summary]')) {
      const next = header.nextElementSibling
      return next && !next.hasAttribute('data-tool-ticker') ? [next] : []
    }
    return [...header.children].slice(1)
  }, () => {
    // Measure the opened body after its translated labels and terminal layout
    // have been applied. The updater would otherwise run later in this frame.
    if (!frame) return
    cancelAnimationFrame(frame)
    flush()
  })
  let frame = 0
  let pruneNeeded = false
  let disposed = false
  let connected
  function clearLabel(title) {
    title?.querySelector(`:scope > [${nativeLabel}]`)?.removeAttribute(nativeLabel)
    title?.querySelector(`:scope > [${customLabel}]`)?.remove()
  }
  function setLabel(title, native, value) {
    if (!native || !value) return clearLabel(title)
    let label = title.querySelector(`:scope > [${customLabel}]`)
    if (!label) {
      label = document.createElement('span')
      label.setAttribute(customLabel, '')
      native.after(label)
    }
    if (label.textContent !== value) label.textContent = value
    native.setAttribute(nativeLabel, '')
  }
  function clearFileLabel(title) {
    title?.querySelector(':scope > [data-hcv-file-activity-label]')?.remove()
    title?.querySelector(':scope > [data-hcv-file-activity-native-stats]')?.removeAttribute('data-hcv-file-activity-native-stats')
  }
  function fileElement(tag, attributes, ...children) {
    const node = document.createElement(tag)
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
    node.append(...children.filter(child => child != null && child !== false))
    return node
  }
  function setToolLabel(title, view, file) {
    const native = title?.querySelector(':scope > span[class~="whitespace-nowrap"][class~="max-w-full"]')
    if (native?.matches('.text-amber-700') || !view?.failed && native?.matches('.text-destructive')) { clearFileLabel(title); return clearLabel(title) }
    if (file && native) {
      title.querySelector(`:scope > [${customLabel}]`)?.remove()
      native.removeAttribute(editPrefix)
      native.setAttribute(nativeLabel, '')
      const key = JSON.stringify(file)
      const old = title.querySelector(':scope > [data-hcv-file-activity-label]')
      if (old?.getAttribute('data-hcv-file-activity-key') !== key) {
        const label = fileActivityLabel(file, fileElement)
        label.setAttribute('data-hcv-file-activity-key', key)
        if (old) old.replaceWith(label)
        else native.after(label)
      }
      title.querySelector(':scope > span.font-mono')?.setAttribute('data-hcv-file-activity-native-stats', '')
      return
    }
    clearFileLabel(title)
    if (view?.prefix) native?.setAttribute(editPrefix, view.prefix)
    else native?.removeAttribute(editPrefix)
    setLabel(title, native, view?.label)
  }
  function showSite(title, data) {
    const current = title.querySelector(`:scope > img[${favicon}]`)
    if (!data) return current?.remove()
    if (current?.getAttribute('src') === data) return
    const img = current || document.createElement('img')
    img.setAttribute(favicon, '')
    img.setAttribute('aria-hidden', 'true')
    img.alt = ''
    img.draggable = false
    img.src = data
    if (!current) title.prepend(img)
  }
  // The desktop already resolves and caches site icons. Resolve the origin
  // once, only from visible browser activity, never from message prose.
  const sites = new IntersectionObserver(records => {
    for (const { target: entry, isIntersecting } of records) {
      if (!isIntersecting || !enabled()) continue
      sites.unobserve(entry)
      const state = siteEntries.get(entry)
      const resolve = window.hermesDesktop?.resolveFavicon
      if (!state || !resolve) continue
      let task = siteIcons.get(state.site)
      if (!task) {
        if (siteIcons.size >= 64) siteIcons.delete(siteIcons.keys().next().value)
        task = Promise.resolve().then(() => resolve(state.site)).then(src =>
          /^data:image\/(?:png|gif|jpe?g|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|avif);base64,/i.test(src || '') ? src : '',
        ).catch(() => '')
        siteIcons.set(state.site, task)
      }
      void task.then(src => {
        if (!disposed && enabled() && entry.isConnected && siteEntries.get(entry) === state) showSite(state.title, src)
      })
    }
  })
  function setSite(entry, title, site) {
    const previous = siteEntries.get(entry)
    if (previous?.site === site && previous?.title === title) return
    if (previous) {
      showSite(previous.title, '')
      sites.unobserve(entry)
      siteEntries.delete(entry)
    }
    if (site && title) {
      siteEntries.set(entry, { site, title })
      sites.observe(entry)
    }
  }
  function queueResponse(response) {
    if (response && !pendingResponses.has(response) && (groups.has(response) || response.querySelector('[data-slot="tool-block"]'))) {
      pendingResponses.add(response)
    }
  }
  function queue(entry) {
    pending.add(entry)
    queueResponse(entry.closest(responseSelector))
  }
  function collect(node) {
    if (!(node instanceof Element)) return
    const parent = node.closest(labelSelector)
    if (parent) queue(parent)
    else for (const entry of node.querySelectorAll(labelSelector)) queue(entry)
  }
  function flush() {
    frame = 0
    pruneNeeded = false
    const russian = document.documentElement.lang.toLowerCase().startsWith('ru')
    groups.prune()
    for (const response of pendingResponses) {
      if (response.isConnected && response.closest(surface)) groups.sync(response, russian)
    }
    pendingResponses.clear()
    for (const entry of pending) {
      if (!entry.isConnected || !entry.closest(surface)) {
        textChanges.set(entry)
        continue
      }
      if (entry.matches(thinkingSelector) || entry.matches(receiptSelector)) {
        const thinking = entry.matches(thinkingSelector)
        const title = (thinking ? entry : entry.querySelector(':scope > [data-conversation-scaffold]'))
          ?.querySelector(':scope > div > button > span:first-child > span:first-child')
        const native = thinking ? title?.firstElementChild : title?.querySelector(':scope > span.truncate')
        textChanges.set(entry, native)
        const text = native?.textContent.trim()
        const localized = russian && text && (thinking ? thoughtLabel(text) : receiptLabel(text))
        setLabel(title, native, localized)
        // Preserve the exact task on hover even when the timeline uses a
        // short status; the original report is still opened by the button.
        const label = title?.querySelector(`:scope > [${customLabel}]`)
        if (!thinking && label && text) label.title = text.replace(/^Subagent (?:Task|Tasks) [^:]+: /, '')
        continue
      }
      const summary = entry.hasAttribute('data-tool-summary')
      const props = readRow(entry)
      const part = props?.part
      if (!summary && part) updateActivityDetails(entry, part.toolName, russian)
      // Hermes marks streaming on a hidden child of the message root, not on
      // an ancestor of each tool row. Keep the ancestor check for older builds.
      const streaming = entry.closest('[data-message-streaming="true"]') ||
        entry.closest(assistant)?.querySelector('[data-message-streaming="true"]')
      const live = summary ? props?.live : Boolean(part && part.result === undefined && part.completedAt == null && streaming)
      const parts = summary ? readRun(entry) : part?.toolName ? [part] : []
      const view = activityPresentation(parts, live, russian, !summary &&
        (entry.closest(`[${activityMember}]`) || entry.closest('[data-tool-group]')?.querySelector(directSummary) ||
          ['write_file', 'edit_file', 'patch'].includes(part?.toolName)), summary)
      entry.toggleAttribute(failedHeader, Boolean(view?.failed))
      const icon = view?.icon ?? nativeIcon(entry, part)
      if (icon) entry.setAttribute(iconAttribute, icon)
      else entry.removeAttribute(iconAttribute)
      const title = findTitle(entry, summary)
      // Some native tools update result text without remounting their header.
      // Watch those tool rows, while ordinary assistant prose stays outside.
      textChanges.set(entry, summary ? title : entry)
      title?.toggleAttribute(fallbackIcon, Boolean(!summary && icon && !title.querySelector(':scope > span > :is(svg, .codicon, [role="status"])')))
      // The outer live summary already names Chrome. Keep the native action
      // name inside its disclosure (and in Hermes's native ticker).
      const inGroup = entry.closest(`[${activityMember}]:not([${activityMember}="closed"])`)
      const tickerView = view?.icon === 'activityBrowser' && (entry.closest('[data-tool-ticker]') || live && inGroup)
        ? { ...view, label: '' } : view
      setToolLabel(title, tickerView, !summary && fileActivityData(part, russian, entry.hasAttribute('data-tool-open')))
      setSite(entry, title, view?.site)
    }
    pending.clear()
    clearReads()
    textChanges.refresh()
  }
  function markChanges(records) {
    for (const { type, target, addedNodes, removedNodes } of records) {
      const element = target instanceof Element ? target : target.parentElement
      // Translated captions are our own output. Changes to the native row still queue it.
      if (!element || element.hasAttribute(customLabel) || element.closest(thinkingBody) || element.closest(`[${activityGroup}], [${activityRepeatGroup}]`)) continue
      if (type === 'attributes') {
        queueResponse(element.closest(responseSelector))
        continue
      }
      if (type === 'characterData' && element.closest('time, [class~="tabular-nums"], [role="status"]')) continue
      if (element.matches(`:is(${messageContent}, ${assistant}, ${responseSelector})`)) {
        queueResponse(element.closest(responseSelector))
      }
      const entry = element.closest(labelSelector)
      if (entry) queue(entry)
      else for (const node of addedNodes) collect(node)
      // Do not let an observed, collapsed browser row keep an old chat alive.
      for (const node of removedNodes) {
        if (!(node instanceof Element) || node.isConnected) continue
        if (node.matches(responseSelector) || node.querySelector(responseSelector)) {
          pruneNeeded = true
        }
        if (siteEntries.has(node)) setSite(node)
        if (node.matches(labelSelector)) textChanges.set(node)
        for (const entry of node.querySelectorAll(labelSelector)) {
          if (siteEntries.has(entry)) setSite(entry)
          textChanges.set(entry)
        }
      }
    }
    textChanges.refresh()
    if ((pruneNeeded || pending.size || pendingResponses.size) && !frame) frame = requestAnimationFrame(flush)
  }
  const observer = new MutationObserver(markChanges)
  const textChanges = observeChatText(markChanges)
  function clearActivity() {
    groups.clear()
    clearActivityDetails()
    for (const entry of document.querySelectorAll(`[${iconAttribute}]`)) {
      siteEntries.delete(entry)
      entry.removeAttribute(iconAttribute)
      entry.removeAttribute(failedHeader)
    }
    for (const node of document.querySelectorAll(`[${nativeLabel}]`)) node.removeAttribute(nativeLabel)
    for (const node of document.querySelectorAll(`[${editPrefix}]`)) node.removeAttribute(editPrefix)
    for (const node of document.querySelectorAll('[data-hcv-file-activity-native-stats]')) node.removeAttribute('data-hcv-file-activity-native-stats')
    for (const node of document.querySelectorAll('[data-hcv-file-activity-key]')) node.remove()
    for (const node of document.querySelectorAll(`[${fallbackIcon}]`)) node.removeAttribute(fallbackIcon)
    for (const node of document.querySelectorAll(`[${customLabel}], img[${favicon}]`)) node.remove()
  }
  function sync() {
    const next = enabled()
    if (connected === next) return
    connected = next
    observer.disconnect()
    textChanges.clear()
    sites.disconnect()
    cancelAnimationFrame(frame)
    frame = 0
    pruneNeeded = false
    pending.clear()
    pendingResponses.clear()
    if (next) {
      collect(document.body)
      flush()
      observer.observe(document.body, { childList: true, subtree: true,
        attributes: true, attributeFilter: ['data-message-streaming'] })
    } else clearActivity()
  }
  const theme = new MutationObserver(records => {
    sync()
    if (connected && records.some(record => record.attributeName === 'lang')) {
      collect(document.body)
      if (!frame) frame = requestAnimationFrame(flush)
    }
  })
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme', 'lang'] })
  ctx.addEventListener(forcedColors, 'change', sync)
  sync()
  ctx.onDispose(() => {
    disposed = true
    observer.disconnect()
    textChanges.clear()
    theme.disconnect()
    sites.disconnect()
    cancelAnimationFrame(frame)
    clearActivity()
    style.remove()
  })
  registerChatImages(ctx, active)
  registerActivityDetails(ctx, chat, output, active)
  registerChatReasoning(ctx, active)
  registerChatSkills(ctx, active)
}
