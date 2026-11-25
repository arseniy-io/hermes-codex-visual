import { codexMask, codexReference as codex } from './codex-reference.js'
import { mountCSS } from './style-scope.js'

const sidebar = '[data-tour="sessions-sidebar"]'
const trigger = '[data-row-actions] > button[data-session-actions]'
const replaced = '[data-hcv-archive-menu-replaced]'
const archiveButton = '[data-hcv-sidebar-archive]'
const archiveTip = '[data-hcv-sidebar-archive-tip]'

// Compact sidebar action and its tooltip in Codex Desktop 26.1120.5083.
// The existing archive-light-16 artwork is also used by the archive toast.
function styles(active, rowSelector) {
  const row = `${active} ${rowSelector}`
  const button = `${row} ${archiveButton}`
  const tip = `${active} ${archiveTip}`
  const openRow = `${row}[data-state="open"]:has(${trigger}${replaced})`
  const menu = `${active}:has(${rowSelector}[data-state="open"] ${trigger}${replaced}) [data-slot="context-menu-content"][data-state="open"]`
  return `
  ${row} ${trigger}${replaced} { visibility: hidden; }
  ${openRow} { background-color: var(--hcv-sidebar-row-highlight); }
  ${menu} {
    inline-size: max-content;
    min-inline-size: min(160px, var(--radix-context-menu-content-available-width, 100vw));
    max-inline-size: min(calc(100vw - 16px), var(--radix-context-menu-content-available-width, 100vw));
    box-shadow: var(--hcv-dropdown-shadow);
  }
  ${button} {
    position: absolute; z-index: 3; inset-inline-end: 8px; inset-block-start: 50%; translate: 0 -50%;
    display: grid; place-items: center; box-sizing: border-box; inline-size: 20px; block-size: 20px;
    padding: 0; border: 0; border-radius: 6px; background: transparent; opacity: 0; pointer-events: none;
    color: light-dark(rgb(26 28 31 / 50%), rgb(255 255 255 / 50%)); cursor: pointer;
  }
  ${row} [data-row-actions] > ${archiveButton} { inset-inline-end: 0; }
  ${button}::before {
    content: ''; position: absolute; inset: 0; border-radius: inherit; opacity: 0;
    background-color: ${codex.sidebar.rowHighlight};
  }
  ${button}::after {
    content: ''; position: relative; inline-size: 14px; block-size: 14px; background: currentColor;
    mask: ${codexMask('archiveToast')} center / contain no-repeat;
  }
  ${row}:is(:hover, :has(:focus-visible)) ${archiveButton} { opacity: 1; pointer-events: auto; }
  ${row}:has(> ${archiveButton}):is(:hover, :has(:focus-visible))::after { opacity: 0; }
  ${button}:is(:hover, :focus-visible) { color: ${codex.sidebar.rowEmphasis}; }
  ${button}:hover::before { opacity: 1; }
  ${button}:active::before { background-color: light-dark(rgb(26 28 31 / 12%), rgb(255 255 255 / 16%)); }
  ${button}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -1px; }
  @media (prefers-reduced-motion: no-preference) {
    ${button}::before { transition: opacity 150ms ease, background-color 150ms ease; }
  }
  @media (hover: none) {
    ${button} { opacity: 1; pointer-events: auto; }
    ${row}:has(> ${archiveButton})::after { opacity: 0; }
  }
  ${tip} {
    position: fixed; z-index: 9999; box-sizing: border-box; inline-size: max-content;
    max-inline-size: min(320px, calc(100vw - 16px)); padding: ${codex.tooltip.padding};
    border: 1px solid color-mix(in oklab, currentColor 5%, transparent); border-radius: ${codex.tooltip.radius};
    background: light-dark(#1a1c1f, #2d2d2d); color: #dfdfdf; box-shadow: 0 8px 18px #0f172a33;
    font: 430 13px/18px var(--hcv-ui-font); letter-spacing: -.15px;
    text-align: center; overflow-wrap: break-word; pointer-events: none; user-select: none;
  }
  ${tip}[hidden] { display: none; }
  @supports (corner-shape: superellipse(1.5)) {
    ${tip} { border-radius: 20px; corner-shape: superellipse(1.5); }
  }
  `
}

export function registerSidebarArchiveAction(ctx, active, rowSelector, readRow, archive) {
  const root = document.documentElement
  const contrast = matchMedia('(forced-colors: none)')
  const enabled = () => contrast.matches && root.matches(active)
  const tip = document.createElement('div')
  tip.dataset.hcvSidebarArchiveTip = ''
  tip.setAttribute('aria-hidden', 'true') // The archive button carries this label.
  tip.hidden = true
  document.body.append(tip)
  mountCSS(ctx, 'data-hcv-sidebar-archive-css', styles(active, rowSelector), { surface: sidebar })

  let anchor
  let timer
  function closeTip() {
    clearTimeout(timer)
    anchor = undefined
    tip.hidden = true
  }

  function showTip(button) {
    if (!button.isConnected || !enabled() || !button.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
      closeTip()
      return
    }
    const { left, width, top, bottom } = button.getBoundingClientRect()
    tip.textContent = button.getAttribute('aria-label')
    tip.hidden = false
    const x = Math.min(innerWidth - tip.offsetWidth - 8, Math.max(8, left + (width - tip.offsetWidth) / 2))
    const y = top - tip.offsetHeight - 4
    tip.style.left = `${x}px`
    tip.style.top = `${y >= 8 ? y : bottom + 4}px`
  }

  function label(button) {
    button.setAttribute('aria-label', root.matches(':lang(ru)') ? 'Архивировать чат' : 'Archive chat')
  }

  function decorate(native) {
    if (native.matches(replaced)) return
    const row = native.closest(rowSelector)
    const props = row && readRow(row)
    if (!props) return
    native.dataset.hcvArchiveMenuReplaced = ''
    if (props.session.archived || row.querySelector(archiveButton)) return

    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.hcvSidebarArchive = ''
    label(button)
    const rail = native.parentElement
    const rowBody = rail.closest('[data-slot="row-button"]')
    // One-line rows use a fixed right edge. In Inbox cards the controls
    // belong to the top line, inside the body rather than beside it.
    if (!rowBody) button.dataset.rowActions = ''
    const container = rowBody ? rail : row
    container.append(button)
    button.addEventListener('pointerdown', event => {
      closeTip()
      if (event.button === 0) event.stopPropagation()
    })
    button.addEventListener('click', event => {
      event.stopPropagation()
      if (enabled()) archive(row)
    })
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch' || event.buttons) return
      closeTip()
      anchor = button
      timer = setTimeout(() => showTip(button), 200)
    })
    button.addEventListener('pointerleave', () => {
      if (anchor !== button || button.matches(':focus-visible')) return
      clearTimeout(timer)
      if (tip.hidden) closeTip()
      else timer = setTimeout(closeTip, 150)
    })
    button.addEventListener('focus', () => {
      if (!button.matches(':focus-visible')) return
      closeTip()
      anchor = button
      showTip(button)
    })
    button.addEventListener('blur', () => { if (anchor === button) closeTip() })
  }

  function scan(element) {
    if (element.matches(trigger)) decorate(element)
    for (const native of element.querySelectorAll(trigger)) decorate(native)
  }

  const rows = new MutationObserver(records => {
    if (anchor && !anchor.isConnected) closeTip()
    for (const { target, addedNodes } of records) {
      if (!addedNodes.length || target.closest?.('[data-chat-surface]')) continue
      const inside = target.closest?.(sidebar)
      for (const node of addedNodes) {
        if (!(node instanceof Element) || node.matches(archiveButton)) continue
        if (inside || node.matches(sidebar) || node.querySelector(sidebar)) scan(node)
      }
    }
  })
  function reset() {
    rows.disconnect()
    closeTip()
    for (const node of document.querySelectorAll(archiveButton)) node.remove()
    for (const node of document.querySelectorAll(replaced)) delete node.dataset.hcvArchiveMenuReplaced
  }
  function sync() {
    if (!enabled()) return reset()
    for (const panel of document.querySelectorAll(sidebar)) scan(panel)
    rows.observe(document.body, { subtree: true, childList: true })
  }

  const theme = new MutationObserver(records => {
    if (records.some(record => record.attributeName !== 'lang')) sync()
    if (records.some(record => record.attributeName === 'lang')) {
      closeTip()
      for (const button of document.querySelectorAll(archiveButton)) label(button)
    }
  })
  theme.observe(root, { attributes: true, attributeFilter: ['data-hermes-codex-visual', 'data-hermes-theme', 'lang'] })
  ctx.addEventListener(contrast, 'change', sync)
  ctx.addEventListener(document, 'contextmenu', closeTip, true)
  ctx.addEventListener(document, 'scroll', closeTip, true)
  ctx.addEventListener(window, 'resize', closeTip)
  ctx.addEventListener(window, 'blur', closeTip)
  ctx.addEventListener(document, 'keydown', event => { if (event.key === 'Escape') closeTip() }, true)
  sync()
  ctx.onDispose(() => { theme.disconnect(); reset(); tip.remove() })
}
