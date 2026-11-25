import { keybindLabel } from './chrome.js'
import { hubSelector } from './dictation.js'
import { mountCSS } from './style-scope.js'

const radix = '[data-slot="tooltip-content"]'
const nativeTip = '[data-hcv-title-tip]'
const bubbles = [
  radix, nativeTip, '[data-hcv-reply-copy-tip]', '[data-hcv-terminal-copy-tip]',
  '[data-hcv-table-tip]', '[data-hcv-queue-tooltip]',
].join(', ')
const videoHint = '[data-hcv-video] .hcv-video-button::after'
const ownTooltip = '[data-slot="tooltip-trigger"], button[data-hcv-terminal-copy], [data-hcv-table-action]'
const titleScope = 'button, [role="button"], a[href], [role="tab"], [role^="menuitem"], [role="option"], label'
const editor = 'iframe, webview, svg, math, [data-terminal], .cm-editor, [contenteditable]:not([contenteditable="false"])'
const hint = ':is(kbd, span.ms-2.opacity-55:last-child)'
const mic = `[data-slot="composer-surface"] ${hubSelector}:not([aria-pressed="true"])`

export function tooltipCopy(value) {
  return value.replace(/(?<=\S)[^\S\r\n]+[·•][^\S\r\n]+(?=\S)/gu, ' ').replaceAll('\u2014', '-')
}

export function registerTooltips(ctx, active) {
  mountCSS(ctx, 'data-hcv-tooltip-style', `
@media (forced-colors: none) {
  ${active} :is(${bubbles}),
  ${active} ${videoHint} {
    box-sizing: border-box;
    max-inline-size: min(320px, calc(100vw - 20px), var(--radix-tooltip-content-available-width, 320px));
    padding: 5px 12px;
    border: 1px solid color-mix(in oklab, currentColor 5%, transparent);
    border-radius: 16px;
    corner-shape: round;
    background: light-dark(#252525, var(--hcv-menu));
    color: #dfdfdf;
    box-shadow: none;
    font: 430 13px/18px var(--hcv-ui-font);
    letter-spacing: -.15px;
    overflow-wrap: anywhere;
    text-align: center;
    filter: none;
    backdrop-filter: none;
  }
  @supports (corner-shape: superellipse(1.5)) {
    ${active} :is(${bubbles}),
    ${active} ${videoHint} { border-radius: 20px; corner-shape: superellipse(1.5); }
  }
  ${active} ${radix} { animation: none; }
  ${active} ${radix} :is([data-slot="tooltip-arrow"], span:has(> [data-slot="tooltip-arrow"])) { display: none; }
  ${active} ${radix} [data-slot="tooltip-label"] > ${hint} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 16px;
    margin-inline: 8px -7px;
    padding: 0 6px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in oklab, currentColor 25%, transparent);
    color: inherit;
    opacity: 1;
    font: inherit;
    white-space: nowrap;
    box-shadow: none;
  }
  ${active} ${nativeTip} {
    position: fixed;
    inset: auto;
    inline-size: max-content;
    margin: 0;
    pointer-events: none;
    user-select: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    ${active} :is(${nativeTip}:popover-open, ${radix}:is([data-state="delayed-open"], [data-state="instant-open"])) {
      animation: hcv-tooltip-in 150ms var(--hcv-enter) both;
    }
    ${active} ${radix}[data-state="closed"] { animation: hcv-tooltip-out 150ms var(--hcv-enter) both; }
  }
  @keyframes hcv-tooltip-in { from { opacity: 0; scale: .97; } to { opacity: 1; scale: 1; } }
  @keyframes hcv-tooltip-out { from { opacity: 1; scale: 1; } to { opacity: 0; scale: .97; } }
}
`)

  const root = document.documentElement
  const colors = matchMedia('(forced-colors: active)')
  const bubble = document.createElement('div')
  bubble.id = 'hcv-platform-tooltip'
  bubble.dataset.hcvTitleTip = ''
  bubble.popover = 'manual'
  bubble.setAttribute('role', 'tooltip')
  let current
  let timer

  function close() {
    window.clearTimeout(timer)
    if (!current) return
    const { anchor, title, description, nameAdded } = current
    current = null
    changes.disconnect()
    if (anchor.getAttribute('title') === '') anchor.setAttribute('title', title)
    if (anchor.getAttribute('aria-describedby') === description) anchor.removeAttribute('aria-describedby')
    if (nameAdded && anchor.getAttribute('aria-label') === nameAdded) anchor.removeAttribute('aria-label')
    bubble.hidePopover()
    bubble.remove()
  }

  function show() {
    if (!current?.anchor.isConnected || !root.matches(active) || colors.matches) { close(); return }
    const { anchor, title } = current
    const target = anchor.getBoundingClientRect()
    if (!target.width || !target.height) { close(); return }
    bubble.textContent = tooltipCopy(title)
    document.body.append(bubble)
    bubble.showPopover()
    const { offsetWidth: width, offsetHeight: height } = bubble
    const x = Math.max(8, Math.min(innerWidth - width - 8, target.left + (target.width - width) / 2))
    const top = target.top >= height + 10
      ? target.top - height - 5
      : Math.min(innerHeight - height - 5, target.bottom + 5)
    bubble.style.left = String(x) + 'px'
    bubble.style.top = String(Math.max(5, top)) + 'px'
    if (!anchor.hasAttribute('aria-describedby')) {
      current.description = bubble.id
      anchor.setAttribute('aria-describedby', current.description)
    }
  }

  function open(event, keyboard = false) {
    const target = event.target
    if (!(target instanceof Element) || !root.matches(active) || colors.matches) return
    if (!keyboard && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
    if (keyboard && !target.matches(':focus-visible')) return
    if (current?.anchor.contains(target)) return
    close()
    if (target.closest(ownTooltip)) return
    const anchor = target.closest('[title]')
    const title = anchor?.getAttribute('title')
    if (!title?.trim() || anchor.closest(editor)) return
    current = { anchor, title }
    if (anchor.matches(titleScope) && !anchor.textContent.trim() &&
        !anchor.hasAttribute('aria-label') && !anchor.hasAttribute('aria-labelledby')) {
      current.nameAdded = tooltipCopy(title)
      anchor.setAttribute('aria-label', current.nameAdded)
    }
    // Keep [title] present for code that uses it to identify the control.
    // Put the real value back before native click and after hover or focus.
    anchor.setAttribute('title', '')
    changes.observe(anchor, { attributes: true, attributeFilter: ['title'] })
    timer = window.setTimeout(show, keyboard ? 0 : 150)
  }

  const changes = new MutationObserver(() => {
    const next = current?.anchor.getAttribute('title')
    if (next === '') return
    if (!next) { close(); return }
    current.title = next
    current.anchor.setAttribute('title', '')
    if (bubble.isConnected) show()
  })
  const decorated = new Map()
  function dictationLabel(tip) {
    for (const node of decorated.keys()) if (!node.isConnected) decorated.delete(node)
    if (decorated.has(tip)) return
    const label = tip.querySelector('[data-slot="tooltip-label"]')
    const node = label?.firstChild
    if (node?.nodeType !== Node.TEXT_NODE || label.childNodes.length !== 1) return
    const original = node.data
    const word = root.matches(':lang(ru)') ? ['Голосовая диктовка', 'Диктовать'] : ['Voice dictation', 'Dictate']
    if (original !== word[0] || !document.querySelector(mic + ':is(:hover, :focus-visible)')) return
    const shown = word[1]
    node.data = shown
    const key = keybindLabel('composer.dictate', undefined, '+')
    const badge = key && document.createElement('kbd')
    if (badge) {
      badge.textContent = key
      badge.setAttribute('aria-hidden', 'true')
      label.append(badge)
    }
    decorated.set(tip, { node, original, shown, badge })
  }
  function clearDictationLabels() {
    for (const { node, original, shown, badge } of decorated.values()) {
      if (node.data === shown) node.data = original
      badge?.remove()
    }
    decorated.clear()
  }
  function sync() {
    if (!root.matches(active)) {
      clearDictationLabels()
      close()
    }
  }
  const theme = new MutationObserver(sync)
  theme.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme', 'data-hermes-codex-visual'] })
  sync()
  ctx.addEventListener(document, 'pointerover', open, true)
  ctx.addEventListener(document, 'pointerout', event => {
    if (current && current.anchor.contains(event.target) && !(event.relatedTarget instanceof Node && current.anchor.contains(event.relatedTarget))) close()
  }, true)
  ctx.addEventListener(document, 'focusin', event => open(event, true), true)
  ctx.addEventListener(document, 'focusout', event => {
    if (current?.anchor.contains(event.target) && !(event.relatedTarget instanceof Node && current.anchor.contains(event.relatedTarget))) close()
  }, true)
  ctx.addEventListener(document, 'pointerdown', close, true)
  ctx.addEventListener(document, 'click', close, true)
  ctx.addEventListener(document, 'keydown', event => { if (event.key === 'Escape') close() }, true)
  ctx.addEventListener(document, 'scroll', close, true)
  ctx.addEventListener(window, 'resize', close)
  ctx.addEventListener(window, 'blur', close)
  ctx.addEventListener(window, 'hashchange', close)
  colors.addEventListener('change', close)
  ctx.onDispose(() => {
    theme.disconnect()
    clearDictationLabels()
    colors.removeEventListener('change', close)
    close()
  })
  return dictationLabel
}
