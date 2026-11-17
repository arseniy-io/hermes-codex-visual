import { codexMask, codexReference } from './codex-reference.js'
import { mountCSS } from './style-scope.js'

const terminal = 'data-hcv-terminal-details'
const command = 'data-hcv-terminal-command'
const header = 'data-hcv-terminal-header'
const status = 'data-hcv-terminal-status'
const native = 'data-hcv-tool-native-caption'
const caption = 'data-hcv-tool-caption'
const sectionLabels = new Map([
  ['Search', 'Поиск'], ['Search results', 'Результаты поиска'], ['File content', 'Содержимое файла'],
  ['stdout', 'Стандартный вывод'], ['stderr', 'Поток ошибок'], ['Output', 'Вывод'],
  ['Arguments', 'Аргументы'], ['Result', 'Результат'],
])

function setCaption(element, value) {
  const current = element.nextElementSibling
  const old = current?.hasAttribute(caption) ? current : null
  if (!value) {
    element.removeAttribute(native)
    old?.remove()
    return
  }
  const label = old ?? document.createElement(element.localName)
  label.setAttribute(caption, '')
  label.className = element.className
  if (label.textContent !== value) label.textContent = value
  if (!old) element.after(label)
  element.setAttribute(native, '')
}

export function updateActivityDetails(row, tool, russian) {
  if (!row.hasAttribute('data-tool-open')) return
  const body = row.children[1]
  if (!body?.matches('div')) return
  for (const label of body.querySelectorAll('p[class~="tracking-[0.08em]"], p[class~="wrap-anywhere"] > span.font-medium:first-child')) {
    if (!label.hasAttribute(caption)) setCaption(label, russian && sectionLabels.get(label.textContent.trim()))
  }
  if (!['terminal', 'read_file'].includes(tool)) return
  if (tool === 'read_file') {
    body.setAttribute(terminal, 'file')
    return
  }
  const transcript = body.querySelector(':scope > div.font-mono:has(> code.min-w-0)')
  if (!transcript) return
  body.setAttribute(terminal, 'shell')
  transcript.setAttribute(command, '')
  let title = body.querySelector(`:scope > [${header}]`)
  if (!title) {
    title = document.createElement('div')
    title.setAttribute(header, '')
    body.prepend(title)
  }
  const titleText = russian ? 'Терминал' : 'Shell'
  if (title.textContent !== titleText) title.textContent = titleText
  const exit = transcript.querySelector(':scope > span.tabular-nums')
  const code = /^exit (-?\d+)$/.exec(exit?.textContent.trim() ?? '')?.[1]
  if (code === undefined) return
  setCaption(exit, code === '0' ? (russian ? 'Успех' : 'Success') : (russian ? 'Код выхода ' : 'Exit code ') + code)
  exit.nextElementSibling.setAttribute(status, code === '0' ? 'success' : 'error')
}

export function clearActivityDetails() {
  for (const name of [terminal, command, native]) {
    for (const node of document.querySelectorAll(`[${name}]`)) node.removeAttribute(name)
  }
  for (const node of document.querySelectorAll(`[${header}], [${caption}]`)) node.remove()
}

export function registerActivityDetails(ctx, chat, output) {
  const shell = `${output}[${terminal}="shell"]`
  const shellRow = `${chat} [data-tool-open][data-tool-row]:has(> [${terminal}="shell"])`
  const file = `${output}[${terminal}="file"]`
  const size = 'calc(var(--hcv-activity-font) - 1px)'
  mountCSS(ctx, 'data-hcv-chat-activity-detail-style', `
@media (forced-colors: none) {
  ${chat} [${native}] { display: none; }
  ${file} pre { scrollbar-width: thin; }
  ${shellRow} { position: relative; }
  ${shellRow}::after {
    content: ''; position: absolute; pointer-events: none;
    inset-block: calc(var(--hcv-activity-line) + 12px) 0; inset-inline-start: 8px;
    border-inline-start: 1px solid var(--hcv-activity-border);
  }
  ${shell} {
    grid-template-columns: minmax(0, 1fr);
    inline-size: calc(100% - 24px);
    margin-block-start: 12px; margin-inline-start: 24px;
    padding: 0; gap: 0; border-radius: 10px;
    background: light-dark(#f5f5f5, #2a2a2a);
    border: 1px solid light-dark(#d9d9d9, #4c4c4c);
  }
  @supports (corner-shape: superellipse(1.5)) {
    ${shell} { border-radius: 12.5px; corner-shape: superellipse(1.5); }
  }
  ${shell} > [${header}] {
    grid-row: 1; padding: 4px 8px;
    font: 430 13px/1.5 ${codexReference.font}; color: var(--hcv-activity-text);
  }
  ${shell} > button { grid-row: 1; inset-block-start: 4px; inset-inline-end: 8px; }
  ${shell} > [${command}] { display: contents; }
  ${shell} > [${command}] > code {
    grid-row: 2; display: block; max-block-size: calc(${size} * 1.5 * 2 + 8px);
    padding: 8px 32px 0 8px; overflow: auto; scrollbar-width: thin;
    font-size: ${size}; line-height: 1.5; color: var(--hcv-chat-prose, var(--hcv-text));
  }
  ${shell} > [${command}] > code > span { color: inherit; }
  ${shell} > div:has(pre) {
    grid-row: 3; min-inline-size: 0; max-block-size: 144px; overflow: auto;
    scrollbar-width: thin;
  }
  ${shell}:has(> button) > div pre, ${shell} > div pre {
    max-block-size: none; padding: 8px; background: transparent; border-radius: 0;
    overflow: visible; white-space: pre; overflow-wrap: normal;
    font-size: ${size}; font-weight: 500; line-height: 1.5;
  }
  ${shell} [${status}] {
    grid-row: 4; justify-self: end; display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 10px 4px; border: 0; background: transparent;
    color: var(--hcv-activity-text);
    font: 430 var(--hcv-activity-font)/1.5 ${codexReference.font};
  }
  ${shell} [${status}="success"]::before {
    content: ''; inline-size: 12px; block-size: 12px;
    background: currentColor; mask: ${codexMask('shellSuccess')} center / contain no-repeat;
  }
  @media (prefers-contrast: more) {
    ${shell} { border-color: currentColor; }
  }
}
  `, { surface: '[data-slot="tool-block"]', retainAcrossChatTabs: true })
}
