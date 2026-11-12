import { host } from '@hermes/plugin-sdk'
import { codexMask } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'

const actionBar = '[data-slot="aui_user-bubble-actions"]'
const bubbleSelector = 'button.composer-human-message'
const restoreButton = 'button:has(> .codicon-discard)'
const rowSelector = '[data-hcv-message-actions]'
const menuSelector = '[data-hcv-message-menu]'
const nativeTimestamp = '[data-slot="timeline-timestamp"]'

const labels = {
  ru: { copyMessage: 'Скопировать сообщение', messageCopied: 'Скопировано', copyMessageError: 'Не удалось скопировать сообщение' },
  en: { copyMessage: 'Copy message', messageCopied: 'Copied', copyMessageError: 'Could not copy the message' },
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
  const menu = `${active} ${menuSelector}`
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
  }
}
`
}

export function registerMessageActions(ctx, active, transcript, promptSelector) {
  ctx.i18n.register(labels)
  const sheet = document.createElement('style')
  sheet.dataset.hcvMessageActionStyle = ''
  sheet.textContent = styles(active, transcript)
  document.head.append(sheet)

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
      if (edit.isConnected) {
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
    holder.after(row)
    update()
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
