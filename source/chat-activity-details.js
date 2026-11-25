import { codexMask, codexReference } from './codex-reference.js'
import { writeClipboardText } from '@hermes/plugin-sdk'
import { committedFiber } from './sidebar-recents.js'
import { registerReplyCopyTip } from './message-actions.js'
import { mountCSS } from './style-scope.js'

const terminal = 'data-hcv-terminal-details'
const command = 'data-hcv-terminal-command'
const header = 'data-hcv-terminal-header'
const status = 'data-hcv-terminal-status'
const native = 'data-hcv-tool-native-caption'
const caption = 'data-hcv-tool-caption'
const codeMark = 'data-hcv-terminal-code'
const expanded = 'data-hcv-terminal-expanded'
const outputMark = 'data-hcv-terminal-output'
const copyMark = 'data-hcv-terminal-copy'
const ownCopy = 'data-hcv-terminal-copy-owned'
const copyLabel = 'data-hcv-terminal-copy-label'
const nativeCopy = new WeakMap()
const nativeCopyMark = 'data-hcv-terminal-native-copy'
const nativeDetails = 'data-hcv-terminal-native-details'
let terminalGeneration = 0
const copyTimers = new Map()
const terminalPayloads = new WeakMap()

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
  body.setAttribute(nativeDetails, '')
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
  // PuGl uses a literal Shell label when the command has no recognized
  // language. That fallback is deliberately not a localized 'Terminal'.
  const titleText = 'Shell'
  if (title.textContent !== titleText) title.textContent = titleText
  const part = committedFiber(row)?.return?.memoizedProps?.part
  prepareTerminalDetails(body, russian, part)
  const exit = transcript.querySelector(':scope > span.tabular-nums')
  const code = /^exit (-?\d+)$/.exec(exit?.textContent.trim() ?? '')?.[1]
  if (code === undefined) return
  setCaption(exit, code === '0' ? (russian ? 'Успех' : 'Success') : (russian ? 'Код выхода ' : 'Exit code ') + code)
  exit.nextElementSibling.setAttribute(status, code === '0' ? 'success' : 'error')
}

export function clearActivityDetails() {
  terminalGeneration += 1
  for (const button of document.querySelectorAll(`[${nativeCopyMark}]`)) {
    const original = nativeCopy.get(button) || {}
    for (const [name, value] of Object.entries(original)) {
      if (value == null) button.removeAttribute(name)
      else button.setAttribute(name, value)
    }
    nativeCopy.delete(button)
    button.removeAttribute(nativeCopyMark)
  }
  for (const [button, timer] of copyTimers) {
    clearTimeout(timer)
    button.removeAttribute('data-hcv-terminal-copied')
    if (button.hasAttribute(ownCopy)) {
      const labels = copyStrings(document.documentElement.lang.toLowerCase().startsWith('ru'))
      button.setAttribute('aria-label', labels.copy)
      button.setAttribute(copyLabel, labels[button.getAttribute(copyMark)])
    }
  }
  copyTimers.clear()
  for (const code of document.querySelectorAll(`[${nativeDetails}] [${codeMark}]`)) {
    for (const name of ['role', 'tabindex', codeMark, expanded]) code.removeAttribute(name)
  }
  for (const node of document.querySelectorAll(`[${nativeDetails}] [${outputMark}], [${nativeDetails}] [${copyMark}]`)) {
    node.removeAttribute(outputMark)
    node.removeAttribute(copyMark)
  }
  for (const button of document.querySelectorAll(`[${nativeDetails}] [${ownCopy}]`)) button.remove()
  for (const name of [command, native]) {
    for (const node of document.querySelectorAll(`[${nativeDetails}] [${name}]`)) node.removeAttribute(name)
  }
  for (const node of document.querySelectorAll(`[${nativeDetails}] [${header}], [${caption}]`)) node.remove()
  for (const body of document.querySelectorAll(`[${nativeDetails}]`)) {
    body.removeAttribute(terminal)
    body.removeAttribute(nativeDetails)
  }
  for (const node of document.querySelectorAll(`[${native}]`)) node.removeAttribute(native)
}

function copyStrings(russian) {
  return russian ? { command: 'Копировать команду', output: 'Копировать вывод', copy: 'Копировать', copied: 'Скопировано' }
    : { command: 'Copy command', output: 'Copy output', copy: 'Copy', copied: 'Copied' }
}

function commandText(body) {
  const code = body.querySelector(`[${codeMark}]`)
  if (!code) return ''
  const clone = code.cloneNode(true)
  clone.querySelector(':scope > span[aria-hidden]')?.remove()
  return clone.textContent
}

function outputText(body) {
  return [...body.querySelectorAll(`[${outputMark}] pre`)].map(pre => pre.textContent).join('\n')
}

function nativeCopyText(button) {
  const row = button.closest('[data-tool-row]')
  for (let fiber = committedFiber(button); fiber; fiber = fiber.return) {
    if (fiber.stateNode === row) break
    if (typeof fiber.memoizedProps?.text === 'string') return fiber.memoizedProps.text
  }
  return null
}

export function terminalResultText(value) {
  if (typeof value === 'string') {
    try { const object = JSON.parse(value); if (object && typeof object === 'object') value = object }
    catch { return value }
    if (typeof value === 'string') return value
  }
  if (!value || typeof value !== 'object') return null
  if (typeof value.output === 'string') return value.output
  const streams = [value.stdout, value.stderr].filter(stream => typeof stream === 'string' && stream.length)
  return streams.length ? streams.join('\n') : null
}

function prepareTerminalDetails(body, russian, part) {
  const code = body.querySelector(`:scope > [${command}] > code`)
  if (!code) return
  const text = code.textContent
  if (code.hasAttribute(expanded) && code.getAttribute(expanded) !== text) code.removeAttribute(expanded)
  code.setAttribute(codeMark, '')
  code.setAttribute('role', 'button')
  code.setAttribute('tabindex', '0')
  const output = [...body.querySelectorAll(':scope > div')].filter(node => node.querySelector('pre'))
  for (const node of output) node.setAttribute(outputMark, '')
  const labels = copyStrings(russian)
  const native = body.querySelector(`:scope > button:not([${ownCopy}])`)
  const payloads = { command: commandText(body), output: terminalResultText(part?.result) ?? outputText(body) }
  terminalPayloads.set(body, payloads)
  const nativeText = native && nativeCopyText(native)
  // Keep Hermes' own CopyButton whenever its stored payload is exactly the
  // command or output shown here. The other action uses the same SDK path.
  const nativeKind = nativeText && nativeText === payloads.output ? 'output'
    : nativeText && nativeText === payloads.command ? 'command' : null
  if (native && !nativeCopy.has(native)) {
    nativeCopy.set(native, Object.fromEntries(
      ['aria-label', 'title', copyMark, copyLabel, 'data-hcv-terminal-copy-hidden'].map(name => [name, native.getAttribute(name)])))
    native.setAttribute(nativeCopyMark, '')
  }
  if (native) {
    native.toggleAttribute('data-hcv-terminal-copy-hidden', !nativeKind)
    if (nativeKind) {
      native.setAttribute(copyMark, nativeKind)
      if (!native.hasAttribute('data-hcv-terminal-copied')) native.setAttribute('aria-label', labels.copy)
      native.removeAttribute('title')
      if (!native.hasAttribute('data-hcv-terminal-copied')) native.setAttribute(copyLabel, labels[nativeKind])
    }
  }
  for (const kind of ['command', 'output']) {
    let button = body.querySelector(`:scope > button[${ownCopy}="${kind}"]`)
    if (!payloads[kind] || nativeKind === kind) { button?.remove(); continue }
    if (!button) {
      button = document.createElement('button')
      button.type = 'button'
      button.setAttribute(ownCopy, kind)
      button.setAttribute(copyMark, kind)
      body.append(button)
    }
    if (!button.hasAttribute('data-hcv-terminal-copied')) button.setAttribute('aria-label', labels.copy)
    button.removeAttribute('title')
    if (!button.hasAttribute('data-hcv-terminal-copied')) button.setAttribute(copyLabel, labels[kind])
  }
}

// Shared by the native tool row and the child transcript renderer. Keep
// the source CopyButton's two-second feedback while using Hermes' SDK writer.
export async function copyTerminalText(button, text, russian) {
  if (!text || button.hasAttribute('data-hcv-terminal-copied') || button.hasAttribute('aria-busy')) return false
  const generation = terminalGeneration
  const labels = copyStrings(russian)
  button.setAttribute('aria-busy', 'true')
  button.setAttribute('aria-disabled', 'true')
  try { await writeClipboardText(text) } finally {
    button.removeAttribute('aria-busy')
    button.removeAttribute('aria-disabled')
  }
  if (!button.isConnected || generation !== terminalGeneration) return true
  clearTimeout(copyTimers.get(button))
  button.setAttribute('data-hcv-terminal-copied', '')
  button.setAttribute('aria-label', labels.copied)
  button.removeAttribute('title')
  button.setAttribute(copyLabel, labels.copied)
  copyTimers.set(button, setTimeout(() => {
    copyTimers.delete(button)
    button.removeAttribute('data-hcv-terminal-copied')
    button.setAttribute('aria-label', labels.copy)
    button.setAttribute(copyLabel, labels[button.getAttribute(copyMark)])
  }, 2000))
  return true
}

export function terminalDetailStyles(shell, shellRow) {
  const size = 'calc(var(--hcv-activity-font, var(--codex-chat-font-size, 14px)) - 1px)'
  const copy = `${shell} [${copyMark}]`
  return `
  ${shellRow} { position: relative; }
  ${shellRow}::after {
    content: ''; position: absolute; pointer-events: none;
    inset-block: calc(var(--hcv-activity-line, 21px) + 12px) 0; inset-inline-start: 8px;
    border-inline-start: 1px solid var(--hcv-activity-border, light-dark(rgb(26 28 31 / 8%), rgb(255 255 255 / 8%)));
  }
  ${shell} {
    display: grid; grid-template-columns: minmax(0, 1fr);
    inline-size: calc(100% - 24px); box-sizing: border-box;
    margin-block-start: 12px; margin-inline-start: 24px;
    padding: 0; gap: 0; border-radius: 10px; overflow: hidden;
    color: light-dark(rgb(26 28 31 / 50%), rgb(255 255 255 / 50%));
    background: light-dark(rgb(26 28 31 / 5%), rgb(255 255 255 / 8%));
    border: 1px solid light-dark(rgb(26 28 31 / 12%), rgb(255 255 255 / 16%));
  }
  @supports (corner-shape: superellipse(1.5)) {
    ${shell} { border-radius: 12.5px; corner-shape: superellipse(1.5); }
  }
  ${shell} > [${header}] {
    grid-row: 1; grid-column: 1; padding: 4px 8px;
    font: 430 13px/${codexReference.typography.smallLine} ${codexReference.font}; color: inherit;
  }
  ${shell} > [${command}] { display: contents; }
  ${shell} > [${command}] > code {
    grid-row: 2; grid-column: 1; min-inline-size: 0;
    margin: 8px 8px 0; padding: 0 24px 0 0;
    max-block-size: none; overflow: hidden;
    font: 430 ${size}/1.5 var(--hcv-mono-font); color: inherit;
    white-space: pre-wrap; overflow-wrap: anywhere; cursor: var(--cursor-interaction, default);
    border-radius: 8px;
  }
  @supports (corner-shape: superellipse(1.5)) {
    ${shell} > [${command}] > code { border-radius: 10px; corner-shape: superellipse(1.5); }
  }
  ${shell} > [${command}] > code:not([${expanded}]) {
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  }
  ${shell} > [${command}] > code[${expanded}] { display: block; }
  ${shell} > [${command}] > code > span { color: inherit; }
  ${shell} > [${command}] > code:focus-visible { outline: 2px solid var(--hcv-focus, Highlight); outline-offset: -2px; }
  ${shell} > [${outputMark}] {
    grid-row: 3; grid-column: 1; min-inline-size: 0; max-block-size: 144px; overflow: auto;
    position: relative; scrollbar-width: thin;
    display: flex; flex-direction: column-reverse;
  }
  ${shell}:has(> button) > div pre, ${shell} > div pre {
    flex: none; max-block-size: none; margin: 0; padding: 8px; background: transparent; border-radius: 0;
    overflow: visible; white-space: pre; overflow-wrap: normal;
    font: 500 ${size}/1.5 var(--hcv-mono-font); color: inherit;
  }
  ${shell} [${status}] {
    grid-row: 4; grid-column: 1; justify-self: end; display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 10px 4px; border: 0; background: transparent;
    color: inherit; font: 430 var(--hcv-activity-font, var(--codex-chat-font-size, 14px))/1.5 ${codexReference.font};
  }
  ${shell} [${status}="success"]::before {
    content: ''; inline-size: 12px; block-size: 12px;
    background: currentColor; mask: ${codexMask('shellSuccess')} center / contain no-repeat;
  }
  ${shell} > [data-hcv-terminal-copy-hidden] { display: none; }
  ${copy} {
    grid-row: 2; grid-column: 1; align-self: start; justify-self: end;
    position: relative !important; inset: auto !important; margin: 8px 8px 0 0;
    z-index: 1; inline-size: 24px; block-size: 24px; padding: 0;
    color: inherit; background: transparent; border: 0; border-radius: 8px;
    display: inline-grid; place-items: center; opacity: 0;
  }
  ${copy}[${copyMark}="output"] { grid-row: 3; margin: 0 10px 0 0; }
  ${copy} button {
    display: inline-grid; place-items: center; inline-size: 24px; block-size: 24px;
    margin: 0; padding: 4px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: inherit; box-sizing: border-box;
  }
  ${copy}:is(button) { padding: 4px; border: 1px solid transparent; box-sizing: border-box; }
  @supports (corner-shape: superellipse(1.5)) {
    ${copy}:is(button), ${copy} button { border-radius: 10px; corner-shape: superellipse(1.5); }
  }
  ${copy}:is(:hover, :focus-visible), ${copy} button:is(:hover, :focus-visible) {
    background: light-dark(rgb(26 28 31 / 5%), rgb(255 255 255 / 8%));
  }
  ${copy}[data-hcv-terminal-copied] { color: var(--hcv-activity-foreground, light-dark(#1a1c1f, #dfdfdf)); }
  ${copy}:focus-visible, ${copy} button:focus-visible { outline: 2px solid var(--hcv-focus, Highlight); outline-offset: -2px; }
  ${copy} :is(svg, .codicon) { inline-size: 14px !important; block-size: 14px !important; }
  ${copy}[${ownCopy}]::before {
    content: ''; inline-size: 14px; block-size: 14px;
    background: currentColor; mask: ${codexMask('copy')} center / contain no-repeat;
  }
  ${copy}[${ownCopy}][data-hcv-terminal-copied]::before { mask-image: ${codexMask('messageCopied')}; }
  ${copy}:not([${ownCopy}])[data-hcv-terminal-copied] :is(svg, .codicon) {
    background: currentColor; mask: ${codexMask('messageCopied')} center / contain no-repeat;
  }
  ${copy}:not([${ownCopy}])[data-hcv-terminal-copied] svg > *,
  ${copy}:not([${ownCopy}])[data-hcv-terminal-copied] .codicon::before { visibility: hidden; }
  ${shell}:has(> [${command}] > code:hover) [${copyMark}="command"],
  ${shell}:has(> [${command}] > code:focus-visible) [${copyMark}="command"],
  ${shell}:has(> [${outputMark}]:hover) [${copyMark}="output"],
  ${copy}:is(:hover, :focus-within, :focus-visible) { opacity: 1; }
  @media (hover: none) { ${copy} { opacity: 1; } }
  @media (prefers-reduced-motion: no-preference) { ${copy} { transition: opacity 150ms ${codexReference.hover}; } }
  @property --hcv-shell-top-fade { syntax: '<length>'; inherits: false; initial-value: 0px; }
  @property --hcv-shell-bottom-fade { syntax: '<length>'; inherits: false; initial-value: 0px; }
  @supports (animation-timeline: --scroll-fade) {
    ${shell} > [${outputMark}] {
      mask-image: linear-gradient(to bottom in oklch, oklch(60% 0 0 / 0), oklch(85% 0 0) var(--hcv-shell-top-fade) calc(100% - var(--hcv-shell-bottom-fade)), oklch(60% 0 0 / 0));
      animation-name: hcv-shell-edge-fade; animation-timing-function: linear;
      animation-fill-mode: both; animation-timeline: scroll(self y); animation-direction: reverse;
    }
  }
  @keyframes hcv-shell-edge-fade {
    0%, 1% { --hcv-shell-top-fade: 0px; --hcv-shell-bottom-fade: 2rem; }
    99%, to { --hcv-shell-top-fade: 2rem; --hcv-shell-bottom-fade: 0px; }
  }
  @media (prefers-contrast: more) { ${shell} > [${outputMark}] { scrollbar-color: CanvasText Canvas; } }
  `
}

export function registerActivityDetails(ctx, chat, output, active) {
  const shell = `${output}[${terminal}="shell"]`
  const shellRow = `${chat} [data-tool-open][data-tool-row]:has(> [${terminal}="shell"])`
  const file = `${output}[${terminal}="file"]`
  const reconcileCopyTip = registerReplyCopyTip(ctx, active, null, {
    marker: 'data-hcv-terminal-copy-tip',
    selector: `:is(${chat} button[${copyMark}], ${active} [data-hcv-subagents-pane] button[${copyMark}])`,
    label: button => button.getAttribute(copyLabel), watchRemoval: true, flip: true,
  })
  const tooltipTheme = new MutationObserver(() => reconcileCopyTip(document.documentElement.matches(active)))
  tooltipTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme', 'lang'] })
  ctx.onDispose(() => tooltipTheme.disconnect())
  mountCSS(ctx, 'data-hcv-chat-activity-detail-style', `
@media (forced-colors: none) {
  ${chat} [${native}] { display: none; }
  ${file} pre { scrollbar-width: thin; }
  ${terminalDetailStyles(shell, shellRow)}
}
  `, { surface: '[data-slot="tool-block"]', retainAcrossChatTabs: true })
  function expand(code) {
    code.setAttribute(expanded, code.textContent)
  }
  ctx.addEventListener(document, 'click', event => {
    if (!(event.target instanceof Element)) return
    const code = event.target.closest(`${chat} [${codeMark}]`)
    if (code) { expand(code); return }
    const button = event.target.closest(`${chat} button[${copyMark}]`)
    if (!button) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (button.hasAttribute('data-hcv-terminal-copied')) return
    const body = button.closest(`[${terminal}="shell"]`)
    const kind = button.getAttribute(copyMark)
    const text = nativeCopy.has(button) ? nativeCopyText(button)
      : terminalPayloads.get(body)?.[kind] ?? (kind === 'command' ? commandText(body) : outputText(body))
    if (!text) return
    void copyTerminalText(button, text, document.documentElement.lang.toLowerCase().startsWith('ru')).catch(() => {})
  }, true)
  ctx.addEventListener(document, 'keydown', event => {
    if (!(event.target instanceof Element) || !['Enter', ' '].includes(event.key)) return
    const code = event.target.closest(`${chat} [${codeMark}]`)
    if (code) { event.preventDefault(); expand(code) }
  })
}
