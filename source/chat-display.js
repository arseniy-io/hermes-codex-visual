import { codexIconRules, codexMask } from './codex-reference.js'
import { registerMessageActions } from './message-actions.js'
import { committedFiber } from './sidebar-recents.js'

const viewportSelector = '[data-slot="aui_thread-viewport"]'
const promptSelector = '[data-slot="aui_user-message-root"][data-message-id]'
// Editable Hermes messages have a labelled native button. Spectator messages,
// system notices and the edit composer use different markup.
const bubbleSelector = 'button.composer-human-message[aria-label]'
const clampSelector = '.sticky-human-clamp'
const previewSelector = '[data-hcv-message-preview]'
const toggleSelector = '[data-hcv-message-toggle]'
const focusable = 'a[href], button, input, select, textarea, summary, pre, [role="button"], [tabindex], [contenteditable]'
const editSelector = '[data-slot="aui_edit-composer-root"]'
const editFrame = '.ui-prompt-input__container.composer-human-message'
const editInput = '[contenteditable="true"][role="textbox"]'

// Codex Desktop 26.1103.4239.0: dKZq / oQwr use a 20-line threshold
// and reserve one line for the ellipsis. The header mask is in 104b47b98f3f.css.
const lineCount = 20
const relaxed = 1.625
const transitionMs = 200
const fadeDistance = '1rem'
const labels = {
  en: { messageShowMore: 'Show more', messageShowLess: 'Show less', cancelEdit: 'Cancel', sendEdit: 'Send' },
  ru: { messageShowMore: 'Показать ещё', messageShowLess: 'Свернуть', cancelEdit: 'Отмена', sendEdit: 'Отправить' },
}

function displayStyles(active, chat) {
  const viewport = `${active} ${chat} ${viewportSelector}`
  const bubble = `${viewport} ${promptSelector} ${bubbleSelector}:has(> ${clampSelector})`
  const body = `${bubble} > ${clampSelector}`
  const toggle = `${viewport} ${toggleSelector}`
  const ellipsis = `${bubble} > [data-hcv-message-ellipsis]`
  const frame = `${viewport} ${editSelector} [data-hcv-edit-controls]`
  const docked = `${active} ${chat}:has([data-slot="composer-dock"]:not([data-popped-out]))`
  // The inline error belongs to an assistant turn. The global alert stack
  // and other notices have their own markup and styles.
  const replyError = `${active} ${chat} [data-slot="aui_assistant-message-content"] > [role="alert"]:has(> div > .aui-error-action)`
  const errorHeader = `${replyError} > div:first-child`
  const errorHeadline = `${errorHeader} > div:first-child`
  const errorClose = `${errorHeader} > button`
  const errorDetails = `${errorHeadline} > details`
  const errorSummary = `${errorDetails} > summary`
  const errorActions = `${replyError} > div:last-child`
  const errorButton = `${errorActions} > .aui-error-action`
  const errorControls = `:is(${errorClose}, ${errorSummary}, ${errorButton})`
  return `
@media (forced-colors: none) {
  ${replyError} {
    gap: 10px;
    margin-block-start: 8px;
    padding: 12px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 16px;
    background: var(--hcv-panel);
    color: var(--hcv-text);
    font: 13px/18px var(--hcv-ui-font);
  }
  ${errorHeader} { gap: 8px; }
  ${errorHeader}::before {
    content: "";
    flex: 0 0 16px;
    block-size: 16px;
    margin-block-start: 1px;
    background-color: var(--dt-destructive);
    mask: ${codexMask('warning')} center / contain no-repeat;
  }
  ${errorHeadline} > div:first-child { font-weight: 600; }
  ${errorHeadline} > div + div { margin-block-start: 2px; color: var(--hcv-muted); }
  ${errorDetails} { margin-block-start: 4px; opacity: 1; }
  ${errorSummary} {
    display: flex;
    align-items: center;
    gap: 4px;
    inline-size: fit-content;
    margin-inline-start: -5px;
    padding: 3px 5px;
    border-radius: 8px;
    color: var(--hcv-muted);
    font-size: 12px;
    line-height: 16px;
    list-style: none;
  }
  ${errorSummary}::-webkit-details-marker { display: none; }
  ${errorSummary}::before {
    content: "";
    flex: 0 0 12px;
    block-size: 12px;
    background-color: currentColor;
    mask: ${codexMask('right')} center / contain no-repeat;
  }
  ${errorDetails}[open] > summary::before { rotate: 90deg; }
  ${errorDetails} > div {
    max-block-size: min(12rem, 35vh);
    margin-block-start: 4px;
    overflow: auto;
    padding: 8px;
    border-radius: 8px;
    background: var(--hcv-chat);
    color: var(--hcv-muted);
    font-size: 12px;
    line-height: 17px;
  }
  ${errorActions} { gap: 4px; padding-inline-start: 24px; }
  ${errorButton} {
    min-block-size: 26px;
    max-inline-size: 100%;
    padding: 4px 8px;
    border: 0;
    border-radius: 8px;
    color: var(--hcv-muted);
    font-size: 12px;
    line-height: 16px;
    text-align: start;
    white-space: normal;
  }
  ${errorButton} > svg { flex: none; }
  ${errorButton}:has(> svg.tabler-icon-refresh) { background: var(--hcv-selected); color: var(--hcv-text); }
  ${errorClose} {
    inline-size: 24px;
    block-size: 24px;
    margin-block: -2px 0;
    margin-inline: 0 -2px;
    border-radius: 8px;
    color: var(--hcv-muted);
    opacity: 1;
  }
  ${errorControls}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${codexIconRules(`${errorButton} > svg.tabler-icon-refresh`, 'refresh')}
  ${codexIconRules(`${errorButton} > svg.tabler-icon-upload`, 'upload')}
  ${codexIconRules(`${errorButton} > svg.tabler-icon-copy`, 'copy')}
  ${codexIconRules(`${errorClose} > svg.tabler-icon-x`, 'close')}
  @media (hover: hover) {
    ${errorControls}:hover:not(:disabled) { background: var(--hcv-hover-menu); color: var(--hcv-text); }
  }

  ${viewport} {
    mask-image: linear-gradient(to bottom, transparent 0, black ${fadeDistance}, black 100%);
  }
  /* Codex scrolls the user turn with the transcript. Hermes's clip observer
     can still see the old overlap for a frame on theme changes. */
  ${viewport} [data-slot="aui_user-message-root"] {
    position: relative;
    top: auto;
  }
  ${viewport} [data-sticky-prompt-clip] {
    clip-path: none;
  }
  /* The viewport already excludes the height above the docked editor (queue,
     status stack). Reserve the editor overlap once, plus 12px to its shell.
     Keep the native clearance element and its scroll anchor. */
  ${docked} [data-slot="aui_thread-content"] {
    --thread-last-message-clearance: calc(var(--composer-surface-measured-height) + 4px);
  }
  ${docked} [data-slot="aui_thread-content"] > [data-slot="aui_message-group"]:not(:has(~ [data-slot="aui_message-group"])) {
    padding-block-end: 0;
  }
  ${bubble} {
    --human-msg-line-height: ${relaxed};
    line-height: ${relaxed};
    overflow: clip;
  }
  ${body}, ${body}[data-clamped="true"] {
    max-height: calc(${lineCount}lh + 1px);
    overflow: clip;
    mask-image: none;
  }
  ${body}${previewSelector} { max-height: var(--hcv-message-height); }
  ${bubble}:has(> ${previewSelector}) {
    row-gap: 0;
    padding-block-end: calc(10px + 10px + ${relaxed}em);
  }
  ${ellipsis} {
    block-size: 0;
    opacity: 0;
    overflow: hidden;
    user-select: none;
  }
  ${ellipsis}::before { content: '…'; }
  ${body}[data-hcv-message-preview="collapsed"] + [data-hcv-message-ellipsis] {
    block-size: 1lh;
    opacity: 1;
  }
  ${toggle} {
    position: absolute;
    z-index: 11;
    inset-inline-start: 16px;
    inset-block-end: 10px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    min-block-size: ${relaxed}em;
    border-radius: 4px;
    background: transparent;
    color: var(--hcv-text);
    font: inherit;
    font-size: var(--conversation-text-font-size);
    line-height: ${relaxed};
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  ${toggle}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 3px; }
  ${toggle}::after {
    content: '';
    inline-size: 14px;
    block-size: 14px;
    background: currentColor;
    mask: ${codexMask('down')} center / contain no-repeat;
  }
  ${toggle}[aria-expanded="true"]::after { rotate: 180deg; }
  /* Codex Desktop y5H2: rounded editor, padded text, right-aligned actions.
     The editor and send action are still Hermes's own controls. */
  ${viewport} ${editSelector} .composer-human-message-container {
    border-radius: 24px;
    background: transparent;
  }
  ${frame} {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px 6px;
    min-block-size: 0;
    padding: 12px;
    overflow: visible;
    border: 0;
    border-radius: 24px;
    background: var(--hcv-bubble);
  }
  ${frame} > ${editInput} {
    grid-column: 1 / -1;
    grid-row: 1;
    min-block-size: 1lh;
    max-block-size: min(40vh, 24rem);
    padding: 0;
    color: var(--hcv-text);
    line-height: var(--conversation-line-height);
    overscroll-behavior: contain;
  }
  ${frame}:has(> ${editInput}:focus-visible) {
    outline: 2px solid var(--hcv-focus);
    outline-offset: 1px;
  }
  ${frame} > :is([data-hcv-edit-cancel], [data-hcv-edit-send]) {
    display: inline-flex;
    position: relative;
    inset: auto;
    grid-row: 2;
    align-items: center;
    justify-content: center;
    min-block-size: 28px;
    block-size: auto;
    inline-size: auto;
    padding: 2px 12px;
    border: 1px solid var(--hcv-stroke);
    border-radius: 999px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  ${frame} > [data-hcv-edit-cancel] { grid-column: 2; color: var(--hcv-text); }
  ${frame} > [data-hcv-edit-cancel]:hover { background: var(--hcv-hover); }
  ${frame} > [data-hcv-edit-send] {
    grid-column: 3;
    border-color: transparent;
    background: var(--hcv-action);
    color: var(--hcv-ink);
  }
  ${frame} > [data-hcv-edit-send]:disabled { opacity: .5; cursor: default; }
  ${frame} > [data-hcv-edit-send]:not(:disabled):hover { filter: brightness(.88); }
  ${frame} > [data-hcv-edit-send] > .codicon-arrow-up { display: none; }
  ${frame} > [data-hcv-edit-send]::after { content: attr(data-hcv-edit-send); }
  ${frame} > :is([data-hcv-edit-cancel], [data-hcv-edit-send]):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: 2px;
  }
  @media (hover: hover) and (pointer: fine) {
    ${toggle}:hover { color: var(--hcv-muted); }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${body}${previewSelector} { transition: max-height ${transitionMs}ms cubic-bezier(.23, 1, .32, 1); }
    ${ellipsis} {
      transition: block-size ${transitionMs}ms cubic-bezier(.23, 1, .32, 1), opacity 120ms var(--hcv-ease);
    }
    ${toggle}::after { transition: rotate 150ms var(--hcv-ease); }
  }
}
`
}

function previewHeight(body, lineHeight) {
  let limit = Math.ceil(lineHeight * (lineCount - 1))
  const fences = body.querySelectorAll('[data-slot="aui_user-fence"]')
  if (!fences.length) return limit
  const bounds = body.getBoundingClientRect()
  const scale = bounds.height / body.offsetHeight || 1
  for (const fence of fences) {
    const rect = fence.getBoundingClientRect()
    const top = (rect.top - bounds.top) / scale
    const bottom = (rect.bottom - bounds.top) / scale
    if (top < limit && bottom > limit) limit = Math.ceil(bottom)
  }
  return limit
}

function syncPreviewFocus(state) {
  for (const node of state.inert) node.removeAttribute('inert')
  state.inert.clear()
  if (state.expanded) return

  const controls = state.body.querySelectorAll(focusable)
  if (!controls.length) return

  const bounds = state.body.getBoundingClientRect()
  const scale = bounds.height / state.body.offsetHeight || 1
  const bottom = bounds.top + state.previewHeight * scale
  for (const node of controls) {
    if (node.closest('[inert]')) continue
    const rect = node.getBoundingClientRect()
    // A link on the last visible line can remain usable if part of it shows.
    if (node.matches('a[href]') ? rect.top >= bottom : rect.bottom > bottom) {
      node.setAttribute('inert', '')
      state.inert.add(node)
    }
  }
}

function keepToggleVisible(state) {
  if (document.activeElement !== state.toggle) return
  const toggle = state.toggle.getBoundingClientRect()
  const view = state.viewport.getBoundingClientRect()
  const top = view.top + 16
  if (toggle.top < top) state.viewport.scrollTop += toggle.top - top
  else if (toggle.bottom > view.bottom) state.viewport.scrollTop += toggle.bottom - view.bottom
}

export function registerChatDisplay(ctx, active) {
  const chat = '[data-chat-surface]:not([data-hud-shell] *)'
  const messageActions = registerMessageActions(ctx, active, `${chat} ${viewportSelector}`, promptSelector)
  const innerSelector = `${chat} ${viewportSelector} ${promptSelector} ${bubbleSelector} > ${clampSelector} > div`
  const editorSelector = `${chat} ${viewportSelector} ${editSelector} ${editFrame}`
  const root = document.documentElement
  const forcedColors = matchMedia('(forced-colors: active)')
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const states = new Map()
  const editors = new Map()
  let nextId = 0
  let frame = 0
  const stylesheet = document.createElement('style')
  stylesheet.setAttribute('data-hcv-chat-display', '')
  stylesheet.textContent = displayStyles(active, chat)
  document.head.append(stylesheet)
  ctx.i18n.register(labels)

  function label(state) {
    if (!state.toggle) return
    const text = ctx.i18n.t(state.expanded ? 'messageShowLess' : 'messageShowMore')
    if (state.toggle.textContent !== text) state.toggle.textContent = text
  }

  function show(state) {
    const value = state.expanded ? 'expanded' : 'collapsed'
    state.clamp.setAttribute('data-hcv-message-preview', value)
    state.clamp.style.setProperty('--hcv-message-height',
      `${state.expanded ? state.fullHeight : state.previewHeight}px`)
    state.toggle.setAttribute('aria-expanded', String(state.expanded))
    label(state)
    syncPreviewFocus(state)
  }

  function removeDisclosure(state) {
    clearTimeout(state.closeTimer)
    state.toggle?.remove()
    state.toggle = null
    state.ellipsis?.remove()
    if (state.clamp.id === state.assignedId) state.clamp.removeAttribute('id')
    state.clamp.removeAttribute('data-hcv-message-preview')
    state.clamp.style.removeProperty('--hcv-message-height')
    for (const node of state.inert) node.removeAttribute('inert')
    state.inert.clear()
    state.expanded = false
  }

  function addDisclosure(state) {
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.setAttribute('data-hcv-message-toggle', '')
    if (!state.clamp.id) {
      state.assignedId = `hcv-message-preview-${++nextId}`
      state.clamp.id = state.assignedId
    }
    toggle.setAttribute('aria-controls', state.clamp.id)
    const ellipsis = document.createElement('span')
    ellipsis.setAttribute('data-hcv-message-ellipsis', '')
    ellipsis.setAttribute('aria-hidden', 'true')
    // Keep decoration out of the native message text and selection.
    state.toggle = toggle
    state.ellipsis = ellipsis
    state.clamp.after(ellipsis)
    // As a sibling, this button never calls Hermes' edit or restore action.
    state.clamp.parentElement.after(toggle)
    toggle.addEventListener('click', () => {
      clearTimeout(state.closeTimer)
      state.expanded = !state.expanded
      show(state)
      if (!state.expanded) {
        if (reducedMotion.matches) keepToggleVisible(state)
        else state.closeTimer = setTimeout(() => keepToggleVisible(state), transitionMs)
      }
    })
  }

  function measure(state) {
    if (!state.body.getClientRects().length || !state.viewport.clientHeight) return
    const lineHeight = Number.parseFloat(getComputedStyle(state.clamp).lineHeight)
    if (!Number.isFinite(lineHeight)) return
    const fullHeight = state.body.scrollHeight
    if (!fullHeight) return
    // Unlike Codex, Hermes already rendered the entire native message. Its
    // 512-chars-per-line render budget doesn't need to truncate that content.
    if (fullHeight <= Math.ceil(lineHeight * lineCount) + 1) {
      if (state.toggle) removeDisclosure(state)
      return
    }
    state.fullHeight = fullHeight
    state.previewHeight = previewHeight(state.body, lineHeight)
    if (!state.toggle) addDisclosure(state)
    show(state)
  }

  const sizes = new ResizeObserver(entries => {
    for (const { target } of entries) {
      const state = states.get(target)
      if (state) measure(state)
    }
  })

  function detach(state) {
    sizes.unobserve(state.body)
    removeDisclosure(state)
    states.delete(state.body)
  }

  function updateEditLabels({ cancel, send }) {
    cancel.textContent = ctx.i18n.t('cancelEdit')
    send.setAttribute('data-hcv-edit-send', ctx.i18n.t('sendEdit'))
  }

  function enhanceEdit(container, input, send) {
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.setAttribute('data-hcv-edit-cancel', '')
    const group = container.closest('[data-slot="aui_message-group"]')
    const thread = group?.parentElement
    const groupIndex = thread ? [...thread.children].indexOf(group) : -1
    // Use the inline editor's own Escape handler without also invoking the
    // global composer shortcut, which may have already torn down its draft.
    let pending = 0
    cancel.addEventListener('click', () => {
      if (pending) return
      const escape = () => {
        const handler = committedFiber(input)?.memoizedProps?.onKeyDown
        if (typeof handler !== 'function' || !input.isConnected) return
        const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
        handler({ key: 'Escape', currentTarget: input, nativeEvent: event, preventDefault: () => event.preventDefault() })
      }
      const suggestionOpen = Boolean(container.parentElement.querySelector('[role="listbox"]'))
      escape()
      pending = requestAnimationFrame(() => {
        if (suggestionOpen && input.isConnected) escape()
        pending = requestAnimationFrame(restoreFocus)
      })
      function restoreFocus() {
        pending = 0
        if (input.isConnected || !thread?.isConnected) return
        const replacement = group.isConnected ? group : thread.children.item(groupIndex)
        replacement?.querySelector(bubbleSelector)?.focus({ preventScroll: true })
      }
    })
    const state = { cancel, input, send, dispose() {
      // A scheduled focus restore is still useful when native cancel just
      // unmounted the edit. When changing themes, stop touching the editor.
      if (container.isConnected) cancelAnimationFrame(pending)
      cancel.remove()
      send.removeAttribute('data-hcv-edit-send')
      container.removeAttribute('data-hcv-edit-controls')
    } }
    updateEditLabels(state)
    container.setAttribute('data-hcv-edit-controls', '')
    send.before(cancel)
    return state
  }

  function reconcile() {
    frame = 0
    const enabled = root.matches(active) && !forcedColors.matches
    messageActions(enabled)
    const current = new Set(enabled ? document.querySelectorAll(innerSelector) : [])
    const currentEditors = new Set(enabled ? document.querySelectorAll(editorSelector) : [])
    for (const [container, state] of editors) {
      if (!currentEditors.has(container) || !container.contains(state.input) || !container.contains(state.send)) {
        state.dispose()
        editors.delete(container)
      }
    }
    for (const container of currentEditors) {
      if (editors.has(container)) continue
      const input = container.querySelector(`:scope > ${editInput}`)
      const send = container.querySelector(':scope > button[aria-label]:has(> .codicon-arrow-up)')
      if (input && send) editors.set(container, enhanceEdit(container, input, send))
    }
    for (const state of states.values()) {
      if (!current.has(state.body) || state.messageId !== state.prompt.dataset.messageId) detach(state)
    }
    for (const body of current) {
      if (states.has(body)) continue
      const viewport = body.closest(viewportSelector)
      const prompt = body.closest(promptSelector)
      const state = {
        body, viewport, prompt, messageId: prompt.dataset.messageId,
        clamp: body.parentElement, expanded: false, inert: new Set(),
      }
      states.set(body, state)
      sizes.observe(body)
    }
  }

  const schedule = () => { if (!frame) frame = requestAnimationFrame(reconcile) }
  const observer = new MutationObserver(records => {
    if (records.some(record => {
      if (record.type === 'attributes') return record.target === root || record.target.matches(promptSelector)
      if (!root.matches(active)) return false
      if (record.target.closest?.(editSelector)) {
        return record.target.matches(editFrame) || record.target.matches(editSelector)
      }
      if (record.target.closest?.(promptSelector) && !record.target.closest(toggleSelector)) return true
      return [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node.matches(`${promptSelector}, ${viewportSelector}, ${editSelector}`) ||
          node.querySelector(`${promptSelector}, ${viewportSelector}, ${editSelector}`)),
      )
    })) schedule()
  })
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-hermes-theme', 'data-hermes-codex-visual', 'data-message-id'],
  })
  forcedColors.addEventListener('change', schedule)
  ctx.i18n.onLocaleChange(() => {
    for (const state of states.values()) label(state)
    for (const state of editors.values()) updateEditLabels(state)
  })
  ctx.onDispose(() => {
    observer.disconnect()
    cancelAnimationFrame(frame)
    forcedColors.removeEventListener('change', schedule)
    for (const state of states.values()) detach(state)
    for (const state of editors.values()) state.dispose()
    editors.clear()
    sizes.disconnect()
    stylesheet.remove()
  })
  schedule()
}

