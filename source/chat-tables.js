import { host } from '@hermes/plugin-sdk'
import { codexMask, codexReference as codex } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'

const nativeTable = '[data-chat-surface]:not([data-hud-shell] *) [data-slot="aui_assistant-message-content"] .aui-md-table > table'
const tableMark = 'data-hcv-markdown-table'
const wrapMark = 'data-hcv-table-scroll'
const toolbarMark = 'data-hcv-table-toolbar'
const dialogMark = 'data-hcv-table-dialog'
const columnMark = 'data-hcv-table-column'
const control = '[data-md-col-handle], [data-hcv-table-toolbar]'
const interactive = 'a[href], button, [role="button"]'

const labels = {
  ru: { copy: 'Копировать таблицу', copied: 'Скопировано', expand: 'Развернуть таблицу',
    preview: 'Предпросмотр таблицы', close: 'Закрыть предпросмотр таблицы', scroll: 'Прокручиваемая таблица' },
  en: { copy: 'Copy table', copied: 'Copied', expand: 'Expand table',
    preview: 'Table preview', close: 'Close table preview', scroll: 'Scrollable table' },
}
const strings = () => document.documentElement.lang.toLowerCase().startsWith('ru') ? labels.ru : labels.en

function make(tag, marker, value = '') {
  const element = document.createElement(tag)
  element.setAttribute(marker, value)
  return element
}

function button(action, label) {
  const element = make('button', 'data-hcv-table-action', action)
  element.type = 'button'
  element.setAttribute('aria-label', label)
  return element
}

function copyOf(table) {
  const clone = table.cloneNode(true)
  for (const node of clone.querySelectorAll(control)) node.remove()
  for (const node of clone.querySelectorAll('[id]')) node.removeAttribute('id')
  clone.removeAttribute('id')
  return clone
}

function markColumns(table) {
  // Codex sizes each column from its longest rendered cell.
  const rows = [...table.rows]
  const longest = []
  for (const row of rows) {
    for (const cell of row.cells) {
      const index = cell.cellIndex
      longest[index] = Math.max(longest[index] || 0, cell.textContent.length)
      if (cell.tagName === 'TD') cell.toggleAttribute('data-hcv-table-number', /^\d+$/.test(cell.textContent))
    }
  }
  const sizes = longest.map(length => length <= 40 ? 'sm' : length <= 100 ? 'md' : length <= 160 ? 'lg' : 'xl')
  for (const row of rows) for (const cell of row.cells) cell.setAttribute(columnMark, sizes[cell.cellIndex])
}

function markdownSource(table) {
  // Streamdown gives the native renderer a HAST node positioned in its block.
  // Copy that slice so links, code, escaped pipes and alignment survive.
  let fiber = committedFiber(table)
  while (fiber && fiber.memoizedProps?.node?.tagName !== 'table') fiber = fiber.return
  const node = fiber?.memoizedProps?.node
  if (node?.tagName !== 'table') return null
  const start = node.position?.start?.offset
  const end = node.position?.end?.offset
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  for (; fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (typeof props?.content !== 'string' || !Number.isInteger(props.index) || end > props.content.length) continue
    const source = props.content.slice(start, end)
    if (source.includes('|') || /^<table[\s>]/i.test(source)) return source
  }
  return null
}

function renderedMarkdown(table) {
  const rows = Array.from(table.rows, row => Array.from(row.cells))
  if (!rows.length) return ''
  const pipeRow = (cells) => '| ' + cells.join(' | ') + ' |'
  const cellText = (cell) => cell.textContent.trim().replaceAll('\\', '\\\\').replaceAll('|', '\\|').replace(/\s+/g, ' ')
  const alignment = { left: ':---', center: ':---:', right: '---:' }
  return [
    pipeRow(rows[0].map(cellText)),
    pipeRow(rows[0].map(cell => alignment[cell.style.textAlign || cell.getAttribute('align')] || '---')),
    ...rows.slice(1).map(row => pipeRow(row.map(cellText))),
  ].join('\n')
}

function clipboardHtml(table) {
  for (const node of table.querySelectorAll('span[data-streamdown="strong"], span[data-streamdown="em"]')) {
    const emphasis = document.createElement(node.dataset.streamdown)
    emphasis.append(...node.childNodes)
    node.replaceWith(emphasis)
  }
  for (const element of [table, ...table.querySelectorAll('*')]) {
    for (const name of ['node', tableMark, columnMark, 'data-hcv-table-number']) element.removeAttribute(name)
  }
  return table.outerHTML
}

function writeRichCopy(text, html) {
  let copied = false
  const onCopy = (event) => {
    if (!event.clipboardData) return
    event.clipboardData.setData('text/plain', text)
    event.clipboardData.setData('text/html', html)
    event.preventDefault()
    event.stopImmediatePropagation()
    copied = true
  }
  window.addEventListener('copy', onCopy, true)
  try {
    return document.execCommand('copy') && copied
  } catch {
    return false
  } finally {
    window.removeEventListener('copy', onCopy, true)
  }
}

function tableCss(active) {
  const scroll = `${active} [${wrapMark}]`
  const toolbar = `${active} [${toolbarMark}]`
  const dialog = `${active} [${dialogMark}]`
  const table = `${active} [${tableMark}]`
  const action = `${active} [data-hcv-table-action]`
  const tip = `${active} [data-hcv-table-tip]`
  return `
  :is(${scroll}, ${dialog}, ${tip}) {
    --hcv-table-chat-font: var(--codex-chat-font-size, 14px);
    --hcv-table-space: calc(var(--hcv-table-chat-font) / 4);
    --hcv-table-width-unit: calc(var(--thread-content-max-width, 48rem) / 24);
    --hcv-table-text: light-dark(#1a1c1f, #dfdfdf);
    --hcv-table-row-border: light-dark(#1a1c1f0f, #dfdfdf0d);
    --hcv-table-header-border: light-dark(#1a1c1f26, #dfdfdf2e);
    --hcv-table-dialog-border: light-dark(#0d0d0d1a, #ffffff1f);
    --hcv-table-preview: light-dark(#f9f9f9, #2d2d2d);
    font-family: ${codex.font};
    color: var(--hcv-table-text);
  }
  ${scroll} {
    box-sizing: border-box;
    inline-size: 100%;
    max-inline-size: 100%;
    position: relative;
    border: 0;
    border-radius: 0;
    margin: calc(var(--hcv-table-space) * 4) 0 0;
    background: transparent;
    overflow: auto hidden;
    scrollbar-width: thin;
  }
  ${scroll}[data-overlay-surface] {
    background-color: transparent !important;
    backdrop-filter: none !important;
  }
  ${table} {
    border: 0;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: auto;
    inline-size: fit-content;
    min-inline-size: 100%;
    max-inline-size: none;
    margin: 0;
    text-align: start;
    color: inherit;
    font: 400 max(var(--codex-chat-code-font-size, 12px), calc(var(--hcv-table-chat-font) * .875)) /
      calc(var(--hcv-table-chat-font) * 1.625) ${codex.font};
    overflow-wrap: anywhere;
  }
  ${scroll} > [${tableMark}]:has(> colgroup) { inline-size: 100%; table-layout: fixed; }
  ${table} :is(thead, tbody, tr, th, td) { margin: 0; border: 0; background: transparent; color: inherit; }
  ${table} :is(th, td) {
    box-sizing: border-box;
    padding: 0 calc(var(--hcv-table-space) * 6) 0 0;
    padding-inline-start: 0;
    padding-inline-end: calc(var(--hcv-table-space) * 6);
    text-align: start;
    vertical-align: top;
    white-space: normal;
    font: inherit;
  }
  ${table} :is(th, td)[align="left"] { text-align: left; }
  ${table} :is(th, td)[align="center"] { text-align: center; }
  ${table} :is(th, td)[align="right"] { text-align: right; }
  ${table} thead th {
    padding-block: calc(var(--hcv-table-space) * 2);
    border-block-end: 1px solid var(--hcv-table-header-border);
    font-weight: 600;
    line-height: calc(var(--hcv-table-space) * 4);
  }
  ${table} th > span:first-child { white-space: normal; overflow: visible; }
  ${table} th:last-child { padding-inline-end: calc(var(--hcv-table-space) * 10); }
  ${table} tbody td { padding-block: calc(var(--hcv-table-space) * 2.5); }
  ${table} tbody tr:not(:last-child) td { border-block-end: 1px solid var(--hcv-table-row-border); }
  ${table} tbody tr:last-child td { padding-block-end: calc(var(--hcv-table-space) * 6); }
  ${table}:not(:has(> colgroup)) [${columnMark}] {
    min-inline-size: calc(var(--hcv-table-width-unit) * var(--hcv-table-column-min));
    max-inline-size: calc(var(--hcv-table-width-unit) * var(--hcv-table-column-max));
  }
  ${table} [${columnMark}="sm"] { --hcv-table-column-min: 4; --hcv-table-column-max: 6; }
  ${table} [${columnMark}="md"] { --hcv-table-column-min: 6; --hcv-table-column-max: 8; }
  ${table} [${columnMark}="lg"] { --hcv-table-column-min: 8; --hcv-table-column-max: 12; }
  ${table} [${columnMark}="xl"] { --hcv-table-column-min: 14; --hcv-table-column-max: 18; }
  ${table} td[data-hcv-table-number] {
    min-inline-size: calc(3ch + (var(--hcv-table-space) * 6));
    white-space: nowrap;
  }
  ${table} :not(pre) > code {
    background: color-mix(in srgb, color-mix(in srgb, var(--hcv-table-text) 9%, transparent) 60%, var(--hcv-table-text) 6%);
    border-radius: 6px;
    padding: 1px 6px;
    box-decoration-break: clone;
    font-family: ui-monospace, "SFMono-Regular", "SF Mono", menlo, consolas, "Liberation Mono", monospace;
    font-size: .92em;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  ${scroll}[data-hcv-table-overflow] > [${tableMark}] {
    mask-image: linear-gradient(to right,
      transparent var(--hcv-table-left),
      black calc(var(--hcv-table-left) + var(--hcv-table-fade-left)) calc(var(--hcv-table-right) - var(--hcv-table-fade-right)),
      transparent var(--hcv-table-right));
  }
  ${toolbar} {
    position: sticky;
    inset-inline-start: 0;
    z-index: 12;
    block-size: 0;
    inline-size: 100%;
    pointer-events: none;
  }
  ${toolbar} > div {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px;
    border-radius: 100vw;
    background: var(--hcv-chat);
    color: color-mix(in srgb, var(--hcv-table-text) 55%, transparent);
    opacity: 0;
    pointer-events: none;
    user-select: none;
  }
  ${scroll}:is(:hover, :focus-within) > [${toolbarMark}] > div { opacity: 1; pointer-events: auto; }
  ${action} {
    box-sizing: border-box;
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 36px;
    block-size: 36px;
    padding: 0;
    border: 0;
    border-radius: 100vw;
    background: transparent;
    color: inherit;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  ${action}:hover { background: color-mix(in srgb, var(--hcv-table-text) 9%, transparent); color: var(--hcv-table-text); }
  ${action}::before {
    content: "";
    inline-size: 16px;
    block-size: 16px;
    background: currentColor;
    mask: var(--hcv-table-icon) center / contain no-repeat;
  }
  ${action}[data-hcv-table-action="copy"] { --hcv-table-icon: ${codexMask('tableCopy')}; }
  ${action}[data-hcv-table-action="copy"][data-copied] { --hcv-table-icon: ${codexMask('check')}; }
  ${action}[data-hcv-table-action="expand"] { --hcv-table-icon: ${codexMask('tableExpand')}; }
  ${action}[data-hcv-table-action="close"] { --hcv-table-icon: ${codexMask('tableClose')}; }
  :is(${action}, ${scroll}, ${dialog} [role="region"]):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -2px;
  }
  ${tip} {
    position: fixed;
    z-index: 9999;
    max-inline-size: calc(100vw - 24px);
    padding: ${codex.tooltip.padding};
    border: 1px solid var(--hcv-table-dialog-border);
    border-radius: ${codex.tooltip.radius};
    background: var(--hcv-table-preview);
    font: 400 13px/18px ${codex.font};
    transform: translate(-50%, -100%);
    pointer-events: none;
  }
  ${dialog} {
    position: fixed;
    inset: 0;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100dvh;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: hidden;
  }
  ${dialog}::backdrop { background: rgb(0 0 0 / .9); }
  ${dialog} [data-hcv-table-stage] {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    place-items: center;
    box-sizing: border-box;
    block-size: 100%;
    min-inline-size: 0;
    padding: 96px 32px 32px;
  }
  ${dialog} [data-hcv-table-panel] {
    box-sizing: border-box;
    display: flex;
    min-block-size: 0;
    max-inline-size: 80%;
    max-block-size: 100%;
    padding: 32px;
    border: 1px solid var(--hcv-table-dialog-border);
    border-radius: 16px;
    background: var(--hcv-table-preview);
    box-shadow: 0 16px 32px -8px #00000030;
    overflow: hidden;
  }
  @supports (corner-shape: superellipse(1.5)) {
    ${dialog} [data-hcv-table-panel] { border-radius: 20px; corner-shape: superellipse(1.5); }
  }
  ${dialog} [role="region"] { min-block-size: 0; min-inline-size: 0; overflow: auto; scrollbar-width: thin; }
  ${dialog} [data-hcv-table-content] { inline-size: fit-content; min-inline-size: 100%; padding-inline-end: 8px; padding-block-end: 8px; }
  ${dialog} [${tableMark}] :is(a, button) { cursor: pointer; }
  ${dialog} [data-hcv-table-action="close"] {
    position: absolute;
    inset-block-start: 48px;
    inset-inline-end: 12px;
    inline-size: 40px;
    block-size: 40px;
    color: var(--hcv-table-text);
    background: light-dark(#f3f3f3, #282828);
    box-shadow: 0 4px 6px -1px #0000001a, 0 0 0 1px #0000000d;
  }
  ${dialog} [data-hcv-table-action="close"]::before { inline-size: 20px; block-size: 20px; }
  ${dialog} [data-hcv-table-action="close"]:hover { background: var(--hcv-selected); }
  @media (max-width: 639px) {
    ${dialog} [data-hcv-table-stage] { padding-inline: 16px; }
    ${dialog} [data-hcv-table-panel] { max-inline-size: 100%; padding-inline: 0; }
    ${dialog} [data-hcv-table-content] { padding-inline: 16px; }
  }
  @media (max-height: 420px) {
    ${dialog} [data-hcv-table-stage] { padding-block: 56px 16px; }
    ${dialog} [data-hcv-table-panel] { padding-block: 16px; }
    ${dialog} [data-hcv-table-action="close"] { inset-block-start: 12px; }
  }
  @media (pointer: coarse), (hover: none) {
    ${scroll} { padding-block-start: 44px; }
    ${toolbar} > div { inset-block-start: -44px; opacity: 1; pointer-events: auto; }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${action} { transition: background-color 150ms, color 150ms, scale 150ms; }
    ${dialog} [data-hcv-table-action="close"]:active { scale: .95; }
  }
  @media (forced-colors: active) {
    ${action}::before { background: ButtonText; forced-color-adjust: none; }
    ${dialog} [data-hcv-table-panel] { border-color: ButtonText; }
    ${scroll}[data-hcv-table-overflow] > [${tableMark}] { mask-image: none; }
  }
  `
}

export function registerChatTables(ctx, active) {
  const root = document.documentElement
  const states = new Map()
  const pending = new Set()
  let frame = 0
  let preview
  let tipTimer
  let tipButton
  const style = make('style', 'data-hcv-chat-tables-style')
  style.textContent = tableCss(active)
  document.head.append(style)
  const tip = make('div', 'data-hcv-table-tip')
  tip.hidden = true
  tip.setAttribute('aria-hidden', 'true')
  document.body.append(tip)

  function hideTip() {
    clearTimeout(tipTimer)
    tipButton = null
    tip.hidden = true
  }

  function showTip(element) {
    hideTip()
    tipButton = element
    tipTimer = setTimeout(() => {
      if (!element.isConnected || tipButton !== element) return
      tip.textContent = element.getAttribute('aria-label')
      tip.hidden = false
      const anchor = element.getBoundingClientRect()
      const half = tip.offsetWidth / 2
      tip.style.left = Math.min(innerWidth - half - 6, Math.max(half + 6, anchor.x + anchor.width / 2)) + 'px'
      tip.style.top = (anchor.top - 3) + 'px'
    }, 250)
  }

  function refreshPreview() {
    const { state, content } = preview
    const clone = copyOf(state.table)
    const before = [...content.querySelectorAll(interactive)]
    const focusIndex = before.indexOf(document.activeElement)
    const nodes = [...clone.querySelectorAll(interactive)]
    const originals = state.table.querySelectorAll(interactive)
    preview.actions = new Map(nodes.map((node, i) => [node, originals[i]]))
    content.replaceChildren(clone)
    nodes[focusIndex]?.focus({ preventScroll: true })
  }

  function closePreview(restoreFocus = true) {
    if (!preview) return
    const { modal, state } = preview
    preview = null
    state.expand.setAttribute('aria-expanded', 'false')
    modal.close()
    modal.remove()
    if (restoreFocus && root.matches(active) && state.expand.isConnected) state.expand.focus({ preventScroll: true })
  }

  function openPreview(state) {
    if (preview) closePreview()
    hideTip()
    const copy = strings()
    const modal = make('dialog', dialogMark)
    const stage = make('div', 'data-hcv-table-stage')
    const panel = make('div', 'data-hcv-table-panel')
    const region = document.createElement('div')
    const content = make('div', 'data-hcv-table-content')
    const close = button('close', copy.close)
    close.autofocus = true
    modal.setAttribute('aria-label', copy.preview)
    modal.setAttribute('role', 'dialog')
    region.setAttribute('role', 'region')
    region.setAttribute('aria-label', copy.scroll)
    region.tabIndex = 0
    region.append(content)
    panel.append(region)
    stage.append(panel)
    modal.append(stage, close)
    document.body.append(modal)
    preview = { modal, state, content }
    refreshPreview()
    state.expand.setAttribute('aria-expanded', 'true')
    close.addEventListener('click', () => closePreview())
    modal.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closePreview()
    })
    modal.addEventListener('cancel', event => {
      event.preventDefault()
      closePreview()
    })
    modal.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target !== stage) return
      event.preventDefault()
      closePreview()
    })
    content.addEventListener('click', event => {
      const origin = preview?.actions.get(event.target.closest(interactive))
      if (!origin?.isConnected) return
      event.preventDefault()
      closePreview(false)
      origin.click()
    })
    modal.showModal()
  }

  function updateOverflow(state) {
    const { wrapper, table } = state
    const width = wrapper.clientWidth
    const wide = width > 0 && wrapper.scrollWidth > width + 1
    if (wide !== wrapper.hasAttribute('data-hcv-table-overflow')) {
      wrapper.toggleAttribute('data-hcv-table-overflow', wide)
      for (const [name, value] of Object.entries(wide ? {
        role: 'region', tabindex: '0', 'aria-label': strings().scroll,
      } : state.nativeAttributes)) {
        if (value === null) wrapper.removeAttribute(name)
        else wrapper.setAttribute(name, value)
      }
    }
    if (!wide) return
    const left = Math.max(0, wrapper.getBoundingClientRect().left - table.getBoundingClientRect().left)
    const right = left + width
    const fade = Math.min(96, width / 3)
    wrapper.style.setProperty('--hcv-table-left', left + 'px')
    wrapper.style.setProperty('--hcv-table-right', right + 'px')
    wrapper.style.setProperty('--hcv-table-fade-left', (left > 2 ? fade : 0) + 'px')
    wrapper.style.setProperty('--hcv-table-fade-right', (right < table.offsetWidth - 2 ? fade : 0) + 'px')
  }

  const resize = new ResizeObserver(entries => {
    for (const { target } of entries) {
      const state = states.get(target.matches('table') ? target : target.querySelector(':scope > table'))
      if (state) updateOverflow(state)
    }
  })

  function attach(table) {
    const wrapper = table.parentElement
    const toolbar = make('div', toolbarMark)
    const bar = document.createElement('div')
    const copy = button('copy', strings().copy)
    const expand = button('expand', strings().expand)
    const listeners = new AbortController()
    const options = { signal: listeners.signal }
    const nativeAttributes = Object.fromEntries(['role', 'tabindex', 'aria-label'].map(name => [name, wrapper.getAttribute(name)]))
    const state = { table, wrapper, toolbar, copy, expand, listeners, nativeAttributes }
    expand.setAttribute('aria-haspopup', 'dialog')
    expand.setAttribute('aria-expanded', 'false')
    bar.append(copy, expand)
    toolbar.append(bar)
    wrapper.prepend(toolbar)
    wrapper.setAttribute(wrapMark, '')
    table.setAttribute(tableMark, '')
    states.set(table, state)
    resize.observe(table)
    resize.observe(wrapper)
    // Hermes's floating composer yields focus to overlay controls. Give only
    // the focused table controls that protection, including focus restoration.
    const originalOverlay = wrapper.getAttribute('data-overlay-surface')
    state.restoreOverlay = () => {
      if (originalOverlay === null) wrapper.removeAttribute('data-overlay-surface')
      else wrapper.setAttribute('data-overlay-surface', originalOverlay)
    }
    wrapper.addEventListener('focus', event => {
      if (event.target === wrapper || toolbar.contains(event.target)) wrapper.setAttribute('data-overlay-surface', '')
    }, { ...options, capture: true })
    wrapper.addEventListener('blur', () => queueMicrotask(() => {
      if (document.activeElement !== wrapper && !toolbar.contains(document.activeElement)) state.restoreOverlay()
    }), { ...options, capture: true })
    for (const control of [copy, expand]) {
      control.addEventListener('pointerenter', () => showTip(control), options)
      control.addEventListener('focus', () => { if (control.matches(':focus-visible')) showTip(control) }, options)
      control.addEventListener('pointerleave', hideTip, options)
      control.addEventListener('blur', hideTip, options)
    }
    copy.addEventListener('click', async () => {
      if (state.copying || copy.hasAttribute('data-copied')) return
      const clone = copyOf(table)
      const source = markdownSource(table) || renderedMarkdown(clone)
      if (!source) return
      state.copying = true
      try {
        if (!writeRichCopy(source, clipboardHtml(clone)) && !await ctx.os.writeClipboard(source)) {
          throw new Error('Clipboard unavailable')
        }
        if (!copy.isConnected) return
        copy.setAttribute('data-copied', '')
        copy.setAttribute('aria-label', strings().copied)
        if (tipButton === copy && !tip.hidden) tip.textContent = strings().copied
        state.copyTimer = setTimeout(() => {
          copy.removeAttribute('data-copied')
          copy.setAttribute('aria-label', strings().copy)
          if (tipButton === copy && !tip.hidden) tip.textContent = strings().copy
        }, 1500)
      } catch {
        if (copy.isConnected) host.notify({ kind: 'error', message: ctx.i18n.t('copyMessageError') })
      } finally {
        state.copying = false
      }
    }, options)
    expand.addEventListener('click', () => openPreview(state), options)
    wrapper.addEventListener('scroll', () => { updateOverflow(state); hideTip() }, options)
    wrapper.addEventListener('keydown', event => {
      if (!wrapper.hasAttribute('data-hcv-table-overflow') || event.defaultPrevented || event.ctrlKey ||
          event.metaKey || event.shiftKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') ||
          (event.target !== wrapper && !toolbar.contains(event.target))) return
      event.preventDefault()
      wrapper.scrollBy({ left: (event.key === 'ArrowLeft' ? -1 : 1) * (event.altKey ? wrapper.clientWidth : 40) })
    }, options)
    return state
  }

  function detach(state) {
    const { table, wrapper, toolbar, nativeAttributes } = state
    if (preview?.state === state) closePreview(false)
    if (toolbar.contains(tipButton)) hideTip()
    state.listeners.abort()
    clearTimeout(state.copyTimer)
    resize.unobserve(table)
    resize.unobserve(wrapper)
    toolbar.remove()
    state.restoreOverlay()
    table.removeAttribute(tableMark)
    wrapper.removeAttribute(wrapMark)
    if (wrapper.hasAttribute('data-hcv-table-overflow')) {
      wrapper.removeAttribute('data-hcv-table-overflow')
      for (const [name, value] of Object.entries(nativeAttributes)) {
        if (value === null) wrapper.removeAttribute(name)
        else wrapper.setAttribute(name, value)
      }
    }
    for (const name of ['left', 'right', 'fade-left', 'fade-right']) wrapper.style.removeProperty('--hcv-table-' + name)
    for (const cell of table.querySelectorAll(`[${columnMark}]`)) {
      cell.removeAttribute(columnMark)
      cell.removeAttribute('data-hcv-table-number')
    }
    states.delete(table)
  }

  function flush() {
    frame = 0
    const enabled = root.matches(active)
    for (const state of states.values()) {
      if (!enabled || !state.table.isConnected || state.table.parentElement !== state.wrapper) detach(state)
    }
    if (enabled) {
      for (const table of pending) {
        if (!table.isConnected || !table.matches(nativeTable)) continue
        const state = states.get(table) || attach(table)
        markColumns(table)
        state.copy.setAttribute('aria-label', state.copy.hasAttribute('data-copied') ? strings().copied : strings().copy)
        state.expand.setAttribute('aria-label', strings().expand)
        updateOverflow(state)
        if (preview?.state === state) refreshPreview()
      }
    }
    pending.clear()
  }

  function queue() {
    if (!frame) frame = requestAnimationFrame(flush)
  }

  const observer = new MutationObserver(records => {
    if (!root.matches(active)) return
    let removed = false
    for (const { target, addedNodes, removedNodes } of records) {
      const element = target instanceof Element ? target : target.parentElement
      if (element?.closest(`[${toolbarMark}], [${dialogMark}], [data-hcv-table-tip]`)) continue
      const table = element?.closest('table')
      if (table?.matches(nativeTable)) pending.add(table)
      for (const node of addedNodes) {
        if (!(node instanceof Element)) continue
        if (node.matches(nativeTable)) pending.add(node)
        else for (const child of node.querySelectorAll(nativeTable)) pending.add(child)
      }
      removed ||= removedNodes.length > 0
    }
    if (pending.size || (removed && states.size)) queue()
  })
  observer.observe(document.body, { childList: true, characterData: true, subtree: true })
  function collect() {
    if (root.matches(active)) for (const table of document.querySelectorAll(nativeTable)) pending.add(table)
    queue()
  }
  const theme = new MutationObserver(collect)
  theme.observe(root, { attributes: true, attributeFilter: ['lang', 'data-hermes-theme'] })
  collect()
  window.addEventListener('scroll', hideTip, true)
  window.addEventListener('resize', hideTip)
  ctx.onDispose(() => {
    observer.disconnect()
    theme.disconnect()
    resize.disconnect()
    cancelAnimationFrame(frame)
    closePreview(false)
    hideTip()
    window.removeEventListener('scroll', hideTip, true)
    window.removeEventListener('resize', hideTip)
    for (const state of states.values()) detach(state)
    tip.remove()
    style.remove()
  })
}
