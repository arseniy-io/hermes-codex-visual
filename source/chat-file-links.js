import { codexMask } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'
import { chatStyles, mountCSS } from './style-scope.js'

const scope = '[data-chat-surface]:not([data-hud-shell] *) [data-slot="aui_assistant-message-content"] .aui-md'
const marked = '[data-hcv-file-reference]'
const control = '[data-hcv-file-reference-control]'
const secondary = '[data-hcv-file-reference-secondary]'

function textOf(value, depth = 0) {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (depth > 5) return ''
  if (Array.isArray(value)) return value.map(child => textOf(child, depth + 1)).join('')
  return textOf(value?.props?.children, depth + 1)
}

function nativeControls(card) {
  const buttons = [...card.querySelectorAll(':scope > button:not([data-hcv-file-reference-control])')]
  return buttons.length === 2 ? { secondary: buttons[0], preview: buttons[1] } : null
}

function referenceInfo(card) {
  const actions = nativeControls(card)
  if (!actions) return null
  let target = ''
  for (let node = committedFiber(card)?.return; node && !(node.stateNode instanceof Element); node = node.return) {
    const props = node.memoizedProps
    if (typeof props?.target === 'string') target ||= props.target
    if (!target || typeof props?.href !== 'string') continue
    const href = props.href
    const label = textOf(props.children).trim()
    // Preview targets created by the normal Markdown file link are rewritten
    // to #preview by Hermes. Explicit delivery cards and MEDIA stay native.
    if (!/^(?:#preview[:/]|file:|\/(?!\/)|~\/|[a-z]:[\\/]|\\\\)/i.test(href) ||
        !/^(?:file:|\/(?!\/)|~\/|[a-z]:[\\/]|\\\\)/i.test(target) ||
        /^preview\s*:/i.test(label) || /(?:^|[\\/])SKILL\.md$/i.test(target)) return null
    return { target, label: label || card.querySelector(':scope > span[title]')?.textContent.trim() || '', ...actions }
  }
  return null
}

export function registerChatFileLinks(ctx, active, candidate) {
  const cardCSS = `${active} ${scope} ${marked}`
  const linkCSS = `${cardCSS} > ${control}`
  const secondaryCSS = `${cardCSS} > ${secondary}`
  // Codex's workspace file reference uses a 16px icon slot and a 3px gap.
  // The original document SVG stays in the private local icon set; the public
  // build uses the project's Tabler fallback.
  mountCSS(ctx, 'data-hcv-chat-file-reference-style', `
    ${cardCSS} { display: contents !important; }
    ${cardCSS} > :not(${control}):not(${secondary}) { display: none !important; }
    ${linkCSS} {
      display: inline; padding: 0; border: 0; background: transparent;
      color: light-dark(#0169cc, #99ceff); font: inherit; font-weight: 500;
      text-align: start; white-space: normal; cursor: pointer;
    }
    ${linkCSS} > [data-hcv-file-reference-label] { overflow-wrap: break-word; }
    ${linkCSS} > [aria-hidden="true"] {
      box-sizing: content-box; vertical-align: middle; align-items: center; display: inline-flex;
      block-size: 1em; padding-inline-end: 3px; transform: translateY(calc(.5ex - .5cap));
    }
    ${linkCSS} > [aria-hidden="true"]::before {
      content: ""; inline-size: 16px; block-size: 16px; background: currentColor;
      mask: ${codexMask('inlineFileDocument')} center / contain no-repeat;
    }
    ${linkCSS}:is(:hover, :focus-visible) > [data-hcv-file-reference-label] {
      text-decoration: underline dashed .5px; text-underline-offset: 2px;
    }
    ${linkCSS}:focus-visible, ${secondaryCSS}:focus-visible {
      outline: 2px solid var(--hcv-focus); outline-offset: 2px; border-radius: 2px;
    }
    ${linkCSS}:disabled { cursor: default; opacity: .6; }
    ${secondaryCSS} {
      display: inline-flex !important; visibility: hidden; opacity: 0 !important;
      pointer-events: none !important; inline-size: 0; block-size: 0; min-inline-size: 0;
      min-block-size: 0; margin: 0; padding: 0 !important;
      border: 0; background: transparent; color: var(--hcv-muted); font-size: 0; line-height: 0;
      vertical-align: middle; align-items: center; justify-content: center; overflow: hidden;
    }
    ${cardCSS}:is(:hover, :focus-within) > ${secondary} {
      visibility: visible; opacity: 1 !important; pointer-events: auto !important;
      inline-size: 20px; block-size: 20px; margin-inline-start: 3px;
    }
    ${secondaryCSS} > svg { inline-size: 14px; block-size: 14px; flex: none; }
  `, chatStyles)

  const pending = new Set()
  const forcedColors = window.matchMedia('(forced-colors: active)')
  let frame = 0
  let connected = false

  function clear(card) {
    card.querySelector(`:scope > ${control}`)?.remove()
    for (const node of card.querySelectorAll(`:scope > ${secondary}`)) node.removeAttribute('data-hcv-file-reference-secondary')
    card.removeAttribute('data-hcv-file-reference')
  }
  function update(card) {
    const info = referenceInfo(card)
    if (!info?.label) return clear(card)
    let button = card.querySelector(`:scope > ${control}`)
    if (!button) {
      button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('data-hcv-file-reference-control', '')
      const icon = document.createElement('span')
      icon.setAttribute('aria-hidden', 'true')
      const label = document.createElement('span')
      label.setAttribute('data-hcv-file-reference-label', '')
      button.append(icon, label)
      button.addEventListener('click', event => {
        if (event.detail > 0 && document.getSelection()?.isCollapsed === false) return
        nativeControls(card)?.preview.click()
      })
      card.insertBefore(button, info.secondary)
    }
    for (const node of card.querySelectorAll(`:scope > ${secondary}`)) {
      if (node !== info.secondary) node.removeAttribute('data-hcv-file-reference-secondary')
    }
    info.secondary.setAttribute('data-hcv-file-reference-secondary', '')
    button.disabled = info.preview.disabled
    button.title = info.target
    if (button.lastChild.textContent !== info.label) button.lastChild.textContent = info.label
    card.setAttribute('data-hcv-file-reference', '')
  }
  function queueCard(node) {
    const element = node instanceof Element ? node : node?.parentElement
    if (!element || element.closest(control)) return
    const card = element.closest(`:is(${candidate}, ${marked})`)
    if (card?.closest(scope)) pending.add(card)
  }
  function collect(node) {
    if (!(node instanceof Element) || node.closest(control)) return
    queueCard(node)
    if (node.closest(scope) || node.querySelector(scope)) {
      for (const item of node.querySelectorAll(candidate)) if (item.closest(scope)) pending.add(item)
    }
  }
  function flush() {
    frame = 0
    for (const card of pending) if (card.isConnected && card.closest(scope)) update(card)
    pending.clear()
  }
  function schedule() {
    if (pending.size && !frame) frame = requestAnimationFrame(flush)
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const node = record.target instanceof Element ? record.target : record.target.parentElement
      if (node?.closest(control)) continue
      // The common Markdown parent can contain many settled links. Only its
      // owning card changed; new descendants are collected from addedNodes.
      queueCard(node)
      if (record.type === 'childList') for (const added of record.addedNodes) collect(added)
    }
    schedule()
  })
  function sync() {
    const enabled = document.documentElement.matches(active) && !forcedColors.matches
    if (connected === enabled) return
    connected = enabled
    observer.disconnect()
    cancelAnimationFrame(frame)
    frame = 0
    pending.clear()
    if (enabled) {
      collect(document.body)
      schedule()
      observer.observe(document.body, { childList: true, characterData: true, subtree: true,
        attributes: true, attributeFilter: ['title', 'disabled'] })
    } else {
      for (const card of document.querySelectorAll(marked)) clear(card)
    }
  }
  const theme = new MutationObserver(sync)
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  ctx.addEventListener(forcedColors, 'change', sync)
  sync()
  ctx.onDispose(() => {
    observer.disconnect()
    theme.disconnect()
    cancelAnimationFrame(frame)
    pending.clear()
    for (const card of document.querySelectorAll(marked)) clear(card)
  })
}
