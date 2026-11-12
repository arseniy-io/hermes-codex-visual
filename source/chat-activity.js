import { codexIconRules, codexMask, codexReference as codex } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'

const surface = '[data-chat-surface]:not([data-hud-shell] *)'
const rowSelector = '[data-tool-row][data-slot="tool-block"]'
const summarySelector = '[data-tool-group] > [data-tool-summary]'
const activitySelector = `${rowSelector}, ${summarySelector}`
const iconAttribute = 'data-hcv-activity-icon'
const toolIcons = new Map([
  ['terminal', 'activityTerminal'], ['execute_code', 'activityTerminal'],
  ['read_file', 'activityRead'], ['list_files', 'folder'],
  ['search_files', 'activitySearch'], ['web_search', 'activitySearch'], ['session_search_recall', 'activitySearch'],
  ['write_file', 'activityEdit'], ['edit_file', 'activityEdit'], ['patch', 'activityEdit'],
  ['vision_analyze', 'activityImage'], ['image_generate', 'activityImage'],
])

function iconFor(entry) {
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
  const name = committedFiber(entry)?.return?.memoizedProps?.part?.toolName
  return toolIcons.get(name) ?? (name?.startsWith('mcp_') ? 'activityIntegration' : null)
}

export function registerChatActivity(ctx, active) {
  const chat = `${active} ${surface}`
  const row = `${chat} ${rowSelector}`
  const summary = `${chat} ${summarySelector}`
  const group = `${chat} [data-tool-group][data-slot="tool-block"]`
  const toggle = `:is(${row} > :first-child, ${summary}) > div > button`
  const title = `${toggle} > span:first-child > span:first-child`
  const glyph = `${title} > span:first-child:has(> :is(svg, .codicon, [role="status"]))`
  const caret = `${toggle}[aria-expanded] > span:nth-child(2) > .codicon-chevron-right`
  const output = `${row}[data-tool-open]:not([data-file-edit]) > :nth-child(2)`
  const preview = `${output} > div:has(> [data-slot="aui_markdown-image"])`
  const thumb = `${preview} [data-slot="aui_markdown-image"]:has(img)`
  const copy = `${output} > button[class~="group-hover/tool-block:opacity-100"]`
  const icons = [...new Set([...toolIcons.values(), 'activityIntegration'])]

  const style = document.createElement('style')
  style.setAttribute('data-hcv-chat-activity-style', '')
  style.textContent = `
@media (forced-colors: none) {
  ${chat} {
    --hcv-activity-text: light-dark(#5d5d5d, #afafaf);
    --hcv-activity-glyph: color-mix(in oklab, var(--hcv-text) 60%, transparent);
    --hcv-activity-border: light-dark(#0d0d0d1a, #ffffff1f);
    --hcv-activity-font: var(--codex-chat-font-size, 14px);
    --hcv-activity-mono: ui-monospace, "SFMono-Regular", "SF Mono", menlo, consolas, "Liberation Mono", monospace;
  }
  :is(${row}, ${summary}) {
    --conversation-tool-font-size: var(--hcv-activity-font);
    --conversation-scaffold-text: var(--hcv-activity-text);
    --conversation-scaffold-meta: var(--hcv-activity-text);
    --ui-text-tertiary: var(--hcv-activity-text);
    opacity: 1;
    font-family: ${codex.font};
    font-weight: 400;
    line-height: 1.5;
  }
  ${row}:not([data-file-edit]), ${row}:not([data-file-edit]) > :first-child {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
  }
  ${group}, ${group} > div:has(> ${rowSelector}) { --tool-row-gap: 4px; }
  ${summary}:has(button[aria-expanded="true"]) + div:not([data-tool-ticker]) {
    margin-block-start: 4px;
    margin-inline-start: 8px;
    padding-inline-start: 16px;
    border-inline-start: 1px solid var(--hcv-activity-border);
  }
  ${toggle} { align-items: start; gap: 4px; padding: 0; border-radius: 6px; }
  ${toggle}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${toggle}:not(:disabled):is(:hover, :focus-visible) { --conversation-scaffold-text: var(--hcv-text); }
  ${title} { gap: 4px; }
  ${glyph} { inline-size: 16px; block-size: 16px; color: var(--hcv-activity-glyph); }
  ${glyph} > :is(svg, .codicon):not([aria-label]) { color: inherit; }
  ${caret} { inline-size: 12px !important; block-size: 12px !important; color: var(--hcv-activity-glyph); }
  ${codexIconRules(caret, 'right')}
  ${toggle}[aria-expanded="true"] > span:nth-child(2) { opacity: 1; }
  ${icons.map(icon => `
    ${chat} [${iconAttribute}="${icon}"] { --hcv-activity-icon: ${codexMask(icon)}; }
  `).join('')}
  ${glyph}:is(${row}[${iconAttribute}] *) > :is(svg[aria-hidden="true"], .codicon):not([aria-label]) {
    inline-size: 16px !important;
    block-size: 16px !important;
    background-color: currentColor;
    mask: var(--hcv-activity-icon) center / contain no-repeat;
  }
  ${glyph}:is(${row}[${iconAttribute}] *) > svg[aria-hidden="true"] > *,
  ${glyph}:is(${row}[${iconAttribute}] *) > .codicon:not([aria-label])::before { visibility: hidden; }
  ${title}:is(${summary}[${iconAttribute}] *)::before {
    content: "";
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    background: var(--hcv-activity-glyph);
    mask: var(--hcv-activity-icon) center / contain no-repeat;
  }
  ${output} { margin-block-start: 4px; padding: 0; gap: 4px; }
  ${output} :is(pre, code, .font-mono) { font-family: var(--hcv-activity-mono); font-size: 12px; line-height: 1.5; }
  ${output} pre, ${output} > .font-mono {
    border: 0;
    border-radius: 6px;
    background: var(--hcv-hover);
    padding: 8px 12px;
  }
  ${output}:has(> button) pre, ${output}:has(> button) > .font-mono { padding-inline-end: 36px; }
  ${output} > button { inset-block-start: 4px; inset-inline-end: 8px; color: var(--hcv-activity-text); }
  /* PuGl in 720744.158c9ed7b0.js uses a hover/focus copy action with duration-basic. */
  ${codexIconRules(`${copy} > svg.tabler-icon-copy`, 'copy')}
  ${codexIconRules(`${copy} > svg.tabler-icon-check`, 'messageCopied')}
  @media (hover: hover) {
    ${copy} { opacity: 0; }
    ${output}:hover > button[class~="group-hover/tool-block:opacity-100"], ${copy}:focus-visible { opacity: 1; }
  }
  @media (hover: none) { ${copy} { opacity: 1; } }
  @media (prefers-reduced-motion: no-preference) {
    ${copy} { transition: opacity 150ms var(--hcv-ease); }
    ${caret} { transition: transform 300ms var(--hcv-ease); }
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
  ${thumb} [data-slot="aui_zoomable-image"] > button:not(.contents) {
    inset-inline-end: 4px;
    inset-block-start: 4px;
    inline-size: 24px;
    block-size: 24px;
  }
  ${thumb} :focus-visible, ${thumb} button:focus-visible > img { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  @media (prefers-reduced-motion: reduce) { :is(${caret}, ${copy}) { transition: none; } }
}
`
  document.head.append(style)

  const pending = new Set()
  let frame = 0
  function collect(node) {
    if (!(node instanceof Element)) return
    const parent = node.closest(activitySelector)
    if (parent) pending.add(parent)
    else for (const entry of node.querySelectorAll(activitySelector)) pending.add(entry)
  }
  function flush() {
    frame = 0
    for (const entry of pending) {
      if (!entry.isConnected || !entry.closest(surface)) continue
      const icon = iconFor(entry)
      if (icon) entry.setAttribute(iconAttribute, icon)
      else entry.removeAttribute(iconAttribute)
    }
    pending.clear()
  }
  const observer = new MutationObserver(records => {
    if (!document.documentElement.matches(active)) return
    for (const { target, addedNodes } of records) {
      const entry = (target instanceof Element ? target : target.parentElement)?.closest(activitySelector)
      if (entry) pending.add(entry)
      else for (const node of addedNodes) collect(node)
    }
    if (pending.size && !frame) frame = requestAnimationFrame(flush)
  })
  observer.observe(document.body, { childList: true, characterData: true, subtree: true })
  const theme = new MutationObserver(() => {
    if (!document.documentElement.matches(active)) return
    collect(document.body)
    if (pending.size && !frame) frame = requestAnimationFrame(flush)
  })
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  collect(document.body)
  flush()
  ctx.onDispose(() => {
    observer.disconnect()
    theme.disconnect()
    cancelAnimationFrame(frame)
    for (const entry of document.querySelectorAll(`[${iconAttribute}]`)) entry.removeAttribute(iconAttribute)
    style.remove()
  })
}
