import { mountStyle } from './style-scope.js'
import { host } from '@hermes/plugin-sdk'
import { codexIconRules, codexMask, codexReference as codex } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'

const actionBar = '[data-slot="aui_user-bubble-actions"]'
const bubbleSelector = 'button.composer-human-message'
const restoreButton = 'button:has(> .codicon-discard)'
const rowSelector = '[data-hcv-message-actions]'
const menuSelector = '[data-hcv-message-menu]'
const nativeTimestamp = '[data-slot="timeline-timestamp"]'
const replyRoot = '[data-slot="aui_assistant-message-root"]'
const replyActions = '[data-slot="aui_msg-actions"]'
const replyLane = ':is(.aui-message-actions-desktop, .aui-message-actions-touch)'
const replyCopy = 'button[data-size="icon"]:not(button[data-size="icon"] ~ button[data-size="icon"])'
const replyTip = '[data-hcv-reply-copy-tip]'
const copyIcon = ':is(.tabler-icon-copy, .lucide-copy)'

const labels = {
  ru: { copyMessage: 'Скопировать сообщение', copyResponse: 'Скопировать ответ', messageCopied: 'Скопировано', copyMessageError: 'Не удалось скопировать сообщение' },
  en: { copyMessage: 'Copy message', copyResponse: 'Copy response', messageCopied: 'Copied', copyMessageError: 'Could not copy the message' },
}

function replyActionLanes(bar) {
  return `:is(${bar}, ${bar} > ${replyLane})`
}

function userMessage(bubble, id) {
  // Match the Assistant UI provider for this exact bubble, including split
  // chats. Hermes keeps the recorded send time in timelineTimestamp.
  for (let node = committedFiber(bubble); node; node = node.return) {
    const client = node.memoizedProps?.value
    if (client?.message?.source !== 'thread' || typeof client.subscribe !== 'function') continue
    try {
      const message = client.message()
      const state = message.getState()
      if (state.id === id && state.role === 'user') return { message, state }
    } catch { return null }
  }
  return null
}

function dateLabel(date) {
  const locale = document.documentElement.lang || undefined
  const options = { hour: 'numeric', minute: '2-digit' }
  const localDay = (day) => Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())
  const age = (localDay(new Date()) - localDay(date)) / 86400000
  if (age > 0 && age < 7) options.weekday = 'long'
  else if (age !== 0) Object.assign(options, { day: 'numeric', month: 'short' })
  return new Intl.DateTimeFormat(locale, options).format(date)
}

function styles(active, transcript) {
  const enhanced = `${active} ${transcript} ${actionBar}:has(${rowSelector})`
  const row = `${enhanced} ${rowSelector}`
  const nativeBubbleActions = `${enhanced} [data-context-menu-skip] > ${bubbleSelector} + div.absolute.pointer-events-none`
  const menu = `${active} ${menuSelector}`
  const reply = `${active} ${transcript} ${replyRoot}`
  const footer = `${reply} div:has(> ${replyActions})`
  const replyBar = `${reply} ${replyActions}`
  const lane = replyActionLanes(replyBar)
  const replyButton = `${lane} > ${replyCopy}`
  const tip = `${active} :is(${replyTip}, [data-hcv-terminal-copy-tip])`
  return `
@media (forced-colors: none) {
  /* Codex vHM0 and .bubble-vBnidZ (fce177e1b845.css). */
  ${enhanced} { min-inline-size: 0; }
  ${enhanced} ${bubbleSelector} {
    inline-size: fit-content;
    margin-inline-start: auto;
    padding: 10px 16px;
    border: 0;
    border-radius: 22px;
    corner-shape: superellipse(1.5);
  }
  /* Hermes places the hover time and inline Stop in this layer. */
  ${nativeBubbleActions},
  ${enhanced} ${restoreButton},
  ${enhanced} .human-message-with-todos-wrapper:has(> ${rowSelector} > time:not([hidden])) > ${nativeTimestamp} { display: none; }

  /* Codex y5H2 keeps the action row in flow at opacity zero. */
  ${row} {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    margin: 4px 4px 0;
    min-block-size: 26px;
    color: var(--hcv-muted);
    opacity: 0;
    pointer-events: none;
  }
  ${active}[data-hermes-mode="dark"] ${rowSelector} { color: #8f8f8f; }
  ${enhanced}:is(:hover, :focus-within) ${rowSelector} { opacity: 1; pointer-events: auto; }
  ${row} time {
    margin-inline-end: 6px;
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: .75rem;
    line-height: 1rem;
  }
  ${row} button {
    display: grid;
    place-items: center;
    flex: 0 0 26px;
    block-size: 26px;
    border-radius: 8px;
    color: inherit;
    cursor: pointer;
  }
  ${row} [hidden] { display: none; }
  ${row} button:focus-visible { outline: 2px solid var(--hcv-focus); }
  ${row} button::before {
    content: "";
    inline-size: 16px;
    block-size: 16px;
    background: currentColor;
    mask: var(--hcv-message-icon) center / contain no-repeat;
  }
  ${row} [data-hcv-copy-message] { --hcv-message-icon: ${codexMask('messageCopy')}; }
  ${row} [data-hcv-copy-message][data-copied] { --hcv-message-icon: ${codexMask('messageCopied')}; }
  ${row} [data-hcv-edit-message] { --hcv-message-icon: ${codexMask('messageEdit')}; }

  /* Codex 26.1111.2228.0: no() in 461952.bb4069593d.js, actionRow-nqqZbm
     and the icon, radius and color tokens in 3b01e25a342d.css / 66582da7ee6b.css. */
  ${footer} { justify-content: flex-start; }
  ${footer} > [data-slot="aui_msg-reactions"]:not([data-reacted]),
  ${lane} > button:not(${replyCopy}) { display: none; }
  ${replyBar} {
    align-items: center;
    justify-content: flex-start;
    min-block-size: 26px;
    margin-block-start: 6px;
    gap: 2px;
    padding-block: 0;
    opacity: 0;
    pointer-events: none;
  }
  ${reply}:is(:hover, :focus-within) ${replyActions} { opacity: 1; pointer-events: auto; }
  ${replyBar} > ${replyLane} { justify-content: flex-start; gap: 2px; }
  ${lane} > time {
    margin-inline: 0 6px;
    padding: 0;
    color: #8f8f8f;
    font: 400 12px/16px var(--hcv-ui-font);
    pointer-events: none;
  }
  ${replyButton} {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: 26px;
    block-size: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    corner-shape: superellipse(1.5);
    opacity: 1;
    color: #8f8f8f;
    background: transparent;
    transition: none;
  }
  ${replyButton}:hover:not(:disabled) {
    color: #8f8f8f;
    background: light-dark(rgb(26 28 31 / 5%), rgb(255 255 255 / 8%));
  }
  ${replyButton}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${replyButton} > svg { inline-size: 14px; block-size: 14px; }
  ${codexIconRules(`${replyButton} > ${copyIcon}`, 'messageCopy')}
  ${codexIconRules(`${replyButton} > :is(.tabler-icon-check, .lucide-check)`, 'messageCopied')}
  /* Tooltip-FE0nMY in 2e662a5288e2.css and the Electron tooltip tokens. */
  ${tip} {
    position: fixed;
    z-index: 9999;
    inline-size: max-content;
    max-inline-size: min(320px, calc(100vw - 30px));
    padding: ${codex.tooltip.padding};
    border: 1px solid color-mix(in oklab, currentColor 5%, transparent);
    border-radius: ${codex.tooltip.radius};
    corner-shape: superellipse(1.5);
    background: light-dark(#1a1c1f, #2d2d2d);
    color: #dfdfdf;
    box-shadow: 0 8px 18px #0f172a33;
    font: 430 13px/18px var(--hcv-ui-font);
    letter-spacing: -.15px;
    text-align: center;
    overflow-wrap: break-word;
    transform: translate(-50%, -100%);
    pointer-events: none;
    user-select: none;
  }
  ${tip}[hidden] { display: none; }
  @supports (corner-shape: superellipse(1.5)) {
    ${replyButton} { border-radius: 10px; }
    ${tip} { border-radius: 20px; }
  }

  ${menu} {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 4px;
    max-inline-size: calc(100vw - 16px);
    border: 0;
    border-radius: var(--hcv-dropdown-radius);
    corner-shape: superellipse(1.5);
    background: var(--hcv-dropdown-background);
    color: var(--hcv-dropdown-text);
    box-shadow: var(--hcv-dropdown-shadow);
    backdrop-filter: none;
    font: 13px/20px var(--hcv-ui-font);
  }
  ${menu} button {
    min-block-size: 28px;
    padding-inline: 8px;
    border-radius: var(--hcv-dropdown-row-radius);
    corner-shape: superellipse(1.5);
    cursor: pointer;
  }
  @media (hover: hover) {
    ${row} button:hover { background: var(--hcv-hover-menu); }
  }
  @media (hover: none) {
    ${row} { opacity: 1; pointer-events: auto; }
    ${row} time { opacity: 0; }
    ${enhanced}:focus-within ${rowSelector} time { opacity: 1; }
    ${replyBar} { opacity: 1; pointer-events: auto; }
  }
}
`
}

export function registerReplyCopyTip(ctx, active, transcript, options = {}) {
  const tip = document.createElement('div')
  tip.setAttribute(options.marker || 'data-hcv-reply-copy-tip', '')
  tip.setAttribute('aria-hidden', 'true') // The native button carries its own accessible name.
  tip.hidden = true
  document.body.append(tip)

  const root = document.documentElement
  const contrast = matchMedia('(forced-colors: active)')
  const selector = options.selector || `${replyActionLanes(`${transcript} ${replyRoot} ${replyActions}`)} > ${replyCopy}`
  const capture = { capture: true }
  let pointerButton
  let button
  let timer
  let triggerType
  let skipDelayUntil = 0
  const trigger = target => root.matches(active) && !contrast.matches && target instanceof Element
    ? target.closest(options.selector ? 'button' : 'button[data-size="icon"]')?.closest(selector)
    : null

  function paint() {
    if (!button?.isConnected || !button.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return hide()
    const anchor = button.getBoundingClientRect()
    const label = options.label ? options.label(button)
      : button.querySelector(copyIcon) ? ctx.i18n.t('copyResponse') : button.getAttribute('aria-label')
    if (!label || (options.flip ? anchor.bottom < 0 || anchor.top > innerHeight : anchor.top < 35 || anchor.bottom > innerHeight)) return hide()
    if (tip.textContent !== label) tip.textContent = label
    tip.style.top = `${anchor.top - 5}px`
    tip.hidden = false
    if (options.flip) {
      const height = tip.offsetHeight
      const below = anchor.top - height - 5 < 15 && innerHeight - anchor.bottom > height + 20
      tip.dataset.side = below ? 'bottom' : 'top'
      tip.style.transform = below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
      tip.style.top = (below ? anchor.bottom + 5 : Math.max(height + 15, anchor.top - 5)) + 'px'
    }
    const half = tip.offsetWidth / 2
    tip.style.left = `${Math.min(innerWidth - half - 15, Math.max(half + 15, anchor.left + anchor.width / 2))}px`
  }

  const copyStatus = new MutationObserver(paint)
  const triggerRemoval = new MutationObserver(() => {
    if (button && !button.isConnected) hide()
  })
  function hide() {
    clearTimeout(timer)
    copyStatus.disconnect()
    triggerRemoval.disconnect()
    button = null
    if (!tip.hidden) skipDelayUntil = performance.now() + 300
    tip.hidden = true
  }

  function show(target, type, delay) {
    hide()
    button = target
    triggerType = type
    const open = () => {
      paint()
      if (button) {
        copyStatus.observe(button, { attributes: true, attributeFilter: ['aria-label', 'data-hcv-terminal-copy-label'] })
        if (options.watchRemoval) triggerRemoval.observe(document.body, { childList: true, subtree: true })
      }
    }
    // Focus changes the toolbar's opacity in CSS. Wait until focus-in and the
    // browser's automatic scroll have settled before checking the anchor.
    if (type === 'focus') timer = setTimeout(open, 0)
    else if (delay && performance.now() >= skipDelayUntil) timer = setTimeout(open, delay)
    else open()
  }

  // Use the native button and its copy action. Suppress the Radix portal
  // before it performs placement; the date is already shown in the row.
  function skipNativeTip(event) {
    if (event.pointerType !== 'touch' && !event.buttons && event.cancelable) event.preventDefault()
  }
  function clearPointer() {
    pointerButton?.removeEventListener('pointermove', skipNativeTip)
    pointerButton = null
  }
  ctx.addEventListener(document, 'pointerover', event => {
    if (event.pointerType === 'touch' || event.buttons) return
    const target = trigger(event.target)
    if (!target || target === pointerButton) return
    clearPointer()
    pointerButton = target
    target.addEventListener('pointermove', skipNativeTip, { passive: false })
    show(target, 'pointer', 150)
  }, capture)
  ctx.addEventListener(document, 'pointerout', event => {
    if (!pointerButton?.contains(event.target) || pointerButton.contains(event.relatedTarget)) return
    if (triggerType === 'pointer') hide()
    clearPointer()
  }, capture)
  ctx.addEventListener(document, 'focusin', event => {
    const target = trigger(event.target)
    if (!target?.matches(':focus-visible')) return
    // Radix opens on focusin before reading its configured (bottom) side.
    // The focus itself and keyboard activation still belong to the button.
    event.stopPropagation()
    show(target, 'focus', 0)
  }, capture)
  ctx.addEventListener(document, 'focusout', event => {
    if (triggerType === 'focus' && event.target === button) hide()
  }, capture)
  ctx.addEventListener(document, 'keydown', event => {
    if (event.key !== 'Escape' || tip.hidden) return
    event.preventDefault()
    event.stopPropagation()
    hide()
  }, capture)
  ctx.addEventListener(document, 'pointerdown', event => {
    if (button && !button.contains(event.target)) hide()
  }, capture)
  ctx.addEventListener(document, 'scroll', () => {
    if (button && (triggerType === 'pointer' || !tip.hidden)) hide()
  }, capture)
  ctx.addEventListener(window, 'blur', hide)
  ctx.addEventListener(window, 'resize', hide)
  function reset() {
    hide()
    clearPointer()
    skipDelayUntil = 0
  }
  ctx.addEventListener(contrast, 'change', reset)
  ctx.i18n.onLocaleChange(() => { if (!tip.hidden) paint() })
  ctx.onDispose(() => { reset(); tip.remove() })
  return enabled => {
    if (!enabled || (pointerButton && !pointerButton.isConnected)) reset()
    else if (button && !button.checkVisibility()) hide()
  }
}

export function registerMessageActions(ctx, active, transcript, promptSelector) {
  ctx.i18n.register(labels)
  const sheet = document.createElement('style')
  sheet.dataset.hcvMessageActionStyle = ''
  sheet.textContent = styles(active, transcript)
  mountStyle(ctx, sheet, { surface: actionBar + ', ' + menuSelector })
  const reconcileReplyTip = registerReplyCopyTip(ctx, active, transcript)

  const rows = new Map()
  const menu = document.createElement('div')
  menu.popover = 'auto'
  menu.dataset.hcvMessageMenu = ''
  const restoreItem = document.createElement('button')
  restoreItem.type = 'button'
  menu.append(restoreItem)
  document.body.append(menu)
  let restoreTarget
  let restoreFocus
  restoreItem.addEventListener('click', () => {
    menu.hidePopover()
    if (restoreTarget?.isConnected) restoreTarget.click()
  })
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    menu.hidePopover()
    restoreFocus?.focus({ preventScroll: true })
  })
  menu.addEventListener('toggle', event => {
    if (event.newState === 'closed') restoreTarget = restoreFocus = undefined
  })

  function addRow(bar, bubble, prompt, messageId) {
    const holder = bubble.closest('[data-context-menu-skip]')
    const row = document.createElement('div')
    row.dataset.hcvMessageActions = ''
    row.setAttribute('data-context-menu-skip', '')
    const stamp = document.createElement('time')
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.dataset.hcvCopyMessage = ''
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.dataset.hcvEditMessage = ''
    row.append(stamp, copy)
    if (bubble.hasAttribute('aria-label')) row.append(edit)

    const updateCopy = () => {
      copy.title = ctx.i18n.t(copy.hasAttribute('data-copied') ? 'messageCopied' : 'copyMessage')
      copy.setAttribute('aria-label', copy.title)
    }
    const update = () => {
      const data = userMessage(bubble, messageId)
      const seconds = data?.state.metadata?.custom?.timelineTimestamp
      const nativeDate = bar.querySelector(`${nativeTimestamp} time`)?.dateTime
      const date = typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000) : new Date(nativeDate)
      stamp.hidden = !Number.isFinite(date.getTime())
      if (!stamp.hidden) {
        const label = dateLabel(date)
        if (stamp.textContent !== label) stamp.textContent = label
        stamp.dateTime = date.toISOString()
        stamp.title = date.toLocaleString(document.documentElement.lang || undefined)
      }
      copy.hidden = !data?.state.content.some(part => part.type === 'text' && part.text.trim())
      if (edit.parentElement === row) {
        edit.title = bubble.getAttribute('aria-label')
        edit.setAttribute('aria-label', edit.title)
        edit.disabled = bubble.disabled
      }
      updateCopy()
    }
    let copying = false
    let clearCopied
    copy.addEventListener('click', async () => {
      if (copying || copy.hasAttribute('data-copied')) return
      const text = userMessage(bubble, messageId)?.message.getCopyText()
      if (!text?.trim()) return
      copying = true
      try {
        const success = await ctx.os.writeClipboard(text)
        if (!row.isConnected) return
        if (!success) {
          host.notify({ kind: 'error', message: ctx.i18n.t('copyMessageError') })
          return
        }
        copy.setAttribute('data-copied', '')
        updateCopy()
        clearCopied = ctx.setTimeout(() => {
          copy.removeAttribute('data-copied')
          updateCopy()
        }, 1500)
      } finally { copying = false }
    })
    edit.addEventListener('click', () => {
      if (bubble.isConnected && prompt.dataset.messageId === messageId) {
        window.getSelection()?.removeAllRanges()
        bubble.click()
      }
    })

    const listeners = new AbortController()
    const options = { signal: listeners.signal }
    bar.addEventListener('pointerenter', update, options)
    bar.addEventListener('focusin', update, options)
    bar.addEventListener('contextmenu', event => {
      const native = holder.querySelector(restoreButton)
      const inActions = row.contains(event.target)
      const inBubble = bubble.contains(event.target) && !committedFiber(holder)?.memoizedProps?.onContextMenu
      if (!native || event.defaultPrevented || (!inActions && !inBubble) ||
        window.getSelection()?.isCollapsed === false) return
      event.preventDefault()
      event.stopPropagation()
      restoreTarget = native
      restoreFocus = event.target.closest('button') || bubble
      restoreItem.textContent = native.getAttribute('aria-label')
      menu.showPopover()
      const anchor = restoreFocus.getBoundingClientRect()
      const x = event.clientX || anchor.left
      const y = event.clientY || anchor.bottom
      menu.style.left = Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8)) + 'px'
      menu.style.top = Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8)) + 'px'
      restoreItem.focus({ preventScroll: true })
    }, options)
    // Fill the detached row before publishing it to the transcript.
    update()
    holder.after(row)
    return { row, prompt, messageId, bubble, update, remove() {
      clearCopied?.()
      listeners.abort()
      if (bar.contains(restoreFocus ?? null) || bar.contains(restoreTarget ?? null)) menu.hidePopover()
      row.remove()
    } }
  }

  ctx.i18n.onLocaleChange(() => rows.forEach(state => state.update()))
  ctx.onDispose(() => {
    rows.forEach(state => state.remove())
    rows.clear()
    menu.remove()
    sheet.remove()
  })

  return function reconcile(enabled) {
    reconcileReplyTip(enabled)
    const current = new Set(enabled ? document.querySelectorAll(`${transcript} ${promptSelector} ${actionBar}`) : [])
    for (const [bar, state] of rows) {
      if (!current.has(bar) || !bar.contains(state.row) || !bar.contains(state.bubble) ||
        state.prompt.dataset.messageId !== state.messageId) {
        state.remove()
        rows.delete(bar)
      }
    }
    for (const bar of current) {
      if (rows.has(bar)) continue
      const bubble = bar.querySelector(bubbleSelector)
      const prompt = bar.closest(promptSelector)
      const messageId = prompt.dataset.messageId
      if (bubble?.closest('[data-context-menu-skip]') && userMessage(bubble, messageId)) {
        rows.set(bar, addRow(bar, bubble, prompt, messageId))
      }
    }
  }
}
