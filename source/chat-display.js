import { chatStyles, mountStyle } from './style-scope.js'
import { codexIconRules, codexMask } from './codex-reference.js'
import { registerMessageActions } from './message-actions.js'
import { committedFiber } from './sidebar-recents.js'
import { registerProjectChatWelcome } from './chat-welcome.js'
import { createComposerClearanceMetrics } from './composer-clearance.js'

const viewportSelector = '[data-slot="aui_thread-viewport"]'
const mainGroup = '[data-tree-group="grp-main"]'
const suspendedTranscript = 'data-hcv-suspended-transcript'
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
  // The same native control also points to pending approvals. Keep that
  // distinct state and its label available.
  const scrollJump = `${active} ${chat} [data-slot="composer-bounds"] > button.thread-jump-button:not([class~="border-primary/40"])`
  const scrollJumpIcon = `${scrollJump} > .codicon-arrow-down`
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
  const modernError = `${active} ${chat} [data-slot="aui_error-card"][role="alert"]`
  const content = `${active} [data-tree-group] ${chat} ${viewportSelector} [data-slot="aui_thread-content"]`
  const tileWelcome = `${active} [data-tree-group] ${chat}[data-composer-target^="tile:"] [data-hcv-project-welcome]`
  const nativeIntro = '[data-slot="aui_intro"]:not([data-hcv-project-welcome]):only-child'
  const projectIntro = '[data-hcv-project-welcome]:only-child'
  const emptyBody = `${viewportSelector} > [data-slot="aui_thread-content"] > div > div`
  const mainPlaceholder = `${docked}[data-composer-target="main"] ${emptyBody}:has(> ${nativeIntro})`
  const tilePlaceholder = `${docked}[data-composer-target^="tile:"] ${emptyBody}:has(> ${projectIntro})`
  return `
  /* Codex 26.1111.2228.0: the default thread inset is 8 × 4px. Hermes
     otherwise resolves its titlebar-based inset to zero in a project tab. */
  ${content}:has(> [data-slot="aui_message-group"]) {
    padding-block-start: 32px;
  }
  /* Hermes adds 4px inside the user row; Codex's message row starts at the
     thread inset, so do not count that padding again on the first row. */
  ${content} > [data-slot="aui_message-group"]:first-of-type > [data-slot="aui_turn-pair"] > ${promptSelector} {
    padding-block-start: 0;
  }
  ${content}[class*="--titlebar-height)+0.75rem"]:has(> [data-slot="aui_message-group"]) {
    padding-block-start: max(32px, calc(var(--titlebar-height) + .75rem));
  }
  [data-hcv-project-welcome] { display: none; }
  /* Let another owner's empty state, such as a bot's, take precedence. */
  ${tileWelcome}:only-child { display: flex !important; }

@media (forced-colors: none) {
  /* The native viewport shrinks when rows are added above the editor. Put
     their height back into the welcome's centering only. The native matching
     top and bottom padding cancel at full height and overflow in short panes. */
  ${mainPlaceholder}, ${tilePlaceholder} {
    padding-block-start: var(--hcv-composer-above-surface, 0px);
  }
  ${mainPlaceholder} > ${nativeIntro}, ${tilePlaceholder} > ${projectIntro} {
    padding-block-end: 0;
  }
  /* Current Hermes error surface. Adapt the same Codex panel and quiet
     controls used below without replacing native actions or diagnostics. */
  ${modernError} {
    gap: 10px; margin-block-start: 8px; padding: 12px;
    border: 1px solid var(--hcv-hairline); border-radius: 16px;
    background: var(--hcv-panel); color: var(--hcv-text);
    font: 13px/18px var(--hcv-ui-font);
  }
  ${modernError} .aui-error-card-head { gap: 8px; }
  ${modernError} .aui-error-card-icon { color: var(--dt-destructive); }
  ${codexIconRules(`${modernError} .aui-error-card-icon`, 'warning')}
  ${modernError} .aui-error-card-title { font-weight: 600; }
  ${modernError} .aui-error-card-body { color: var(--hcv-muted); }
  ${modernError} :is(.aui-error-action, .aui-error-card-toggle, .aui-error-card-close, .aui-error-details-link) {
    border-radius: 8px; font-size: 12px; line-height: 16px;
    color: var(--hcv-muted);
  }
  ${modernError} .aui-error-action { background: var(--hcv-selected); color: var(--hcv-text); }
  ${modernError} .aui-error-details-slab { background: var(--hcv-chat); color: var(--hcv-muted); border-radius: 8px; }
  ${modernError} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${codexIconRules(`${modernError} .aui-error-card-close > svg`, 'close')}
  @media (hover: hover) {
    ${modernError} button:hover:not(:disabled) { background: var(--hcv-hover-menu); color: var(--hcv-text); }
  }
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

  /* Codex 26.1111.2228.0: 344734.3322725bda.js uses native thin gutters.
     The overflow-y-auto rules in 66582da7ee6b.css use the border tokens. */
  ${viewport} {
    mask-image: linear-gradient(to bottom, transparent 0, black ${fadeDistance}, black 100%);
    scrollbar-width: thin;
    scrollbar-gutter: stable both-edges;
      scrollbar-color: light-dark(rgb(26 28 31 / 7.8%), rgb(255 255 255 / 8.4%)) transparent;
  }
  ${viewport}:is(:hover, :active) {
      scrollbar-color: light-dark(rgb(26 28 31 / 11.7%), rgb(255 255 255 / 15.6%)) transparent;
  }
  /* wqAy.R and vFsk.w in Codex 344734.3322725bda.js. Keep Hermes's
     measured dock height so the gap also clears its status stack. */
  ${scrollJump} {
    bottom: calc(var(--composer-measured-height) + 1.5rem) !important;
    inline-size: 2rem;
    block-size: 2rem;
    justify-content: center;
    gap: 0;
    padding: 0;
    border: 1px solid light-dark(rgb(26 28 31 / 8%), rgb(255 255 255 / 8%));
    border-radius: 50%;
    background: var(--hcv-chat) padding-box;
    color: light-dark(#1a1c1f, #dfdfdf);
    box-shadow: 0px 2px 4px -1px #00000014;
    backdrop-filter: none;
    cursor: default;
    opacity: 0;
    transform: translateX(-50%);
    animation: none;
    transition: opacity 120ms cubic-bezier(0, 0, .2, 1);
  }
  ${scrollJump}[aria-hidden="false"] { opacity: 1; }
  ${scrollJump}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 2px; }
  ${scrollJump} > span { display: none; }
  ${scrollJumpIcon} { flex: none; inline-size: 20px; block-size: 20px; }
  ${codexIconRules(scrollJumpIcon, 'scrollToBottom')}
  @media (prefers-reduced-motion: reduce) {
    ${scrollJump} { transition: none; }
  }
  @media (prefers-contrast: more) {
    ${viewport}, ${viewport}:is(:hover, :active) { scrollbar-color: CanvasText Canvas; }
  }
  /* Codex leaves the in-flow action row below the bubble, then 16px
     between the user message and the response. Avoid counting Hermes's
     additional bottom padding as a second conversation gap. */
  ${viewport} [data-slot="aui_turn-pair"] { row-gap: 16px; }
  ${viewport} [data-slot="aui_turn-pair"] > ${promptSelector} { padding-block-end: 0; }
  ${active} ${mainGroup} [data-pane-hidden] ${viewportSelector}[${suspendedTranscript}] > [data-slot="aui_thread-content"] {
    content-visibility: hidden;
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
  /* Codex Gjet.F (632620.21f2e5d141.js): 32px below the transcript,
     followed by one measured-footer spacer. Recompute Hermes' viewport calc
     on its owning surface: the :root definition has already substituted the
     root fallback sizes before the native per-surface metrics are inherited.
     Private exact metrics avoid the native 8px measurement buckets. */
  ${docked} [data-slot="aui_thread-content"] {
    --thread-last-message-clearance: calc(var(--composer-surface-measured-height) + 4px);
  }
  ${docked}:not([data-hud-shell] *) {
    --thread-viewport-height: max(0px, calc(100% - var(--hcv-composer-dock-height, var(--composer-measured-height)) + var(--hcv-composer-surface-height, var(--composer-surface-measured-height))));
  }
  ${docked}:not([data-hud-shell] *) [data-slot="aui_thread-content"] {
    --thread-last-message-clearance: calc(var(--hcv-composer-surface-height, var(--composer-surface-measured-height)) + 32px);
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
  /* y5H2 uses rounded-3xl and 12px padding; see 9ec44337a842.css. */
  ${viewport} ${editSelector} .composer-human-message-container {
    --hcv-edit-radius: 20px;
    border-radius: var(--hcv-edit-radius);
    corner-shape: superellipse(1.5);
    background: transparent;
  }
  @supports (corner-shape: superellipse(1.5)) {
    ${viewport} ${editSelector} .composer-human-message-container { --hcv-edit-radius: 25px; }
  }
  ${frame} {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px 6px;
    min-block-size: 0;
    padding: 12px;
    overflow: visible;
    border: 0;
    border-radius: var(--hcv-edit-radius, 20px);
    corner-shape: superellipse(1.5);
    background: light-dark(color-mix(in oklab, var(--hcv-text) 5%, transparent), var(--hcv-bubble));
  }
  ${frame} > ${editInput} {
    grid-column: 1 / -1;
    grid-row: 1;
    min-block-size: 1lh;
    max-block-size: min(40vh, 24rem);
    padding: 0;
    color: var(--hcv-text);
    font-size: 14px;
    line-height: 21px;
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

function previewBounds(body) {
  const bounds = body.getBoundingClientRect()
  return { top: bounds.top, scale: bounds.height / body.offsetHeight || 1 }
}

function previewHeight(lineHeight, fences, bounds) {
  let limit = Math.ceil(lineHeight * (lineCount - 1))
  if (!fences.length) return limit
  for (const fence of fences) {
    const rect = fence.getBoundingClientRect()
    const top = (rect.top - bounds.top) / bounds.scale
    const bottom = (rect.bottom - bounds.top) / bounds.scale
    if (top < limit && bottom > limit) limit = Math.ceil(bottom)
  }
  return limit
}

function clippedControls(state, controls, bounds) {
  const clipped = new Set()
  if (!controls.length) return clipped
  const bottom = bounds.top + state.previewHeight * bounds.scale
  for (const node of controls) {
    let ancestor = node
    while (ancestor && !clipped.has(ancestor) &&
      (!ancestor.hasAttribute('inert') || state.inert.has(ancestor))) ancestor = ancestor.parentElement
    if (ancestor) continue
    const rect = node.getBoundingClientRect()
    // A link on the last visible line can remain usable if part of it shows.
    if (node.matches('a[href]') ? rect.top >= bottom : rect.bottom > bottom) clipped.add(node)
  }
  return clipped
}

function syncPreviewFocus(state, clipped) {
  // Finish reading geometry before applying inert. Keep controls that are
  // still clipped inert even when ResizeObserver measures the preview again.
  for (const node of state.inert) {
    if (!clipped.has(node)) node.removeAttribute('inert')
  }
  for (const node of clipped) {
    if (!node.hasAttribute('inert')) node.setAttribute('inert', '')
  }
  state.inert = clipped
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
  registerProjectChatWelcome(ctx)
  const chat = '[data-chat-surface]:not([data-hud-shell] *)'
  const messageActions = registerMessageActions(ctx, active, `${chat} ${viewportSelector}`, promptSelector)
  const innerSelector = `${chat} ${viewportSelector} ${promptSelector} ${bubbleSelector} > ${clampSelector} > div`
  const editorSelector = `${chat} ${viewportSelector} ${editSelector} ${editFrame}`
  const root = document.documentElement
  const forcedColors = matchMedia('(forced-colors: active)')
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const states = new Map()
  const editors = new Map()
  const deferredMeasurements = new Set()
  const hiddenPane = '[data-pane-hidden], [hidden]'
  const lastFollowing = new WeakMap()
  const readingViewports = new WeakSet()
  let selectedViewport = null
  let previousViewport = null
  let suspendedViewport = null
  const composerMetrics = createComposerClearanceMetrics()
  let nextId = 0
  let frame = 0
  let transcriptChanged = false
  const stylesheet = document.createElement('style')
  stylesheet.setAttribute('data-hcv-chat-display', '')
  stylesheet.textContent = displayStyles(active, chat)
  mountStyle(ctx, stylesheet, chatStyles)
  ctx.i18n.register(labels)

  function label(state) {
    if (!state.toggle) return
    const text = ctx.i18n.t(state.expanded ? 'messageShowLess' : 'messageShowMore')
    if (state.toggle.textContent !== text) state.toggle.textContent = text
  }

  function show(state) {
    const value = state.expanded ? 'expanded' : 'collapsed'
    const height = `${state.expanded ? state.fullHeight : state.previewHeight}px`
    const expanded = String(state.expanded)
    if (state.clamp.getAttribute('data-hcv-message-preview') !== value) {
      state.clamp.setAttribute('data-hcv-message-preview', value)
    }
    if (state.clamp.style.getPropertyValue('--hcv-message-height') !== height) {
      state.clamp.style.setProperty('--hcv-message-height', height)
    }
    if (state.toggle.getAttribute('aria-expanded') !== expanded) state.toggle.setAttribute('aria-expanded', expanded)
    label(state)
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
      const controls = state.expanded ? [] : state.body.querySelectorAll(focusable)
      const bounds = controls.length ? previewBounds(state.body) : null
      syncPreviewFocus(state, clippedControls(state, controls, bounds))
      show(state)
      if (!state.expanded) {
        if (reducedMotion.matches) keepToggleVisible(state)
        else state.closeTimer = setTimeout(() => keepToggleVisible(state), transitionMs)
      }
    })
  }

  function measure(state) {
    // A cached pane still has layout boxes. Read them when it is shown again.
    if (state.viewport.closest(hiddenPane)) {
      deferredMeasurements.add(state)
      return
    }
    deferredMeasurements.delete(state)
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
    const fences = state.body.querySelectorAll('[data-slot="aui_user-fence"]')
    const controls = state.expanded ? [] : state.body.querySelectorAll(focusable)
    const bounds = fences.length || controls.length ? previewBounds(state.body) : null
    state.previewHeight = previewHeight(lineHeight, fences, bounds)
    syncPreviewFocus(state, clippedControls(state, controls, bounds))
    if (!state.toggle) addDisclosure(state)
    show(state)
  }

  const sizes = new ResizeObserver(entries => {
    composerMetrics.resize(entries)
    for (const { target } of entries) {
      const state = states.get(target)
      if (state) measure(state)
    }
  })

  function detach(state) {
    deferredMeasurements.delete(state)
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

  function reconcileTranscript(enabled) {
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

  function rememberFollowing(viewport) {
    if (!viewport.closest(hiddenPane)) lastFollowing.set(viewport, viewport.dataset.following === 'true')
  }

  function rememberReadingPosition(event) {
    const viewport = selectedViewport
    if (!viewport?.isConnected || viewport.closest(hiddenPane) || readingViewports.has(viewport)) return
    // Native follow can briefly reset on focus changes. Save intentional
    // reading activity or the current reading position before tab input.
    if (event.type === 'wheel') {
      if (event.deltaY < 0 && viewport.contains(event.target)) readingViewports.add(viewport)
    } else if (viewport.dataset.following === 'false' &&
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop > 1) {
      readingViewports.add(viewport)
    }
  }

  function suspendOlderTranscript(surfaces) {
    const viewports = Array.from(surfaces, surface =>
      surface.closest(mainGroup) && surface.querySelector(viewportSelector)).filter(Boolean)
    if (!viewports.includes(selectedViewport)) selectedViewport = null
    if (!viewports.includes(previousViewport)) previousViewport = null
    const shown = viewports.find(viewport => !viewport.closest(hiddenPane))
    if (shown) {
      if (shown !== selectedViewport) {
        previousViewport = selectedViewport?.isConnected ? selectedViewport : null
        selectedViewport = shown
      }
      rememberFollowing(shown)
    } else if (!viewports.length) {
      selectedViewport = previousViewport = null
    }
    // Keep the preceding tab ready and preserve reading positions.
    const next = viewports.find(viewport => viewport !== shown && viewport !== selectedViewport &&
      viewport !== previousViewport && viewport.closest(hiddenPane) && lastFollowing.get(viewport) &&
      !readingViewports.has(viewport))
    if (next === suspendedViewport) return
    suspendedViewport?.removeAttribute(suspendedTranscript)
    suspendedViewport = next
    suspendedViewport?.setAttribute(suspendedTranscript, '')
  }

  function reconcile() {
    frame = 0
    const enabled = root.matches(active) && !forcedColors.matches
    const surfaces = enabled ? document.querySelectorAll(chat) : []
    if (transcriptChanged) messageActions(enabled)
    suspendOlderTranscript(surfaces)
    composerMetrics.sync(surfaces, sizes)
    if (transcriptChanged) reconcileTranscript(enabled)
    transcriptChanged = false
    if (enabled) for (const state of deferredMeasurements) measure(state)
  }

  const scheduleLayout = () => { if (!frame) frame = requestAnimationFrame(reconcile) }
  const schedule = () => {
    transcriptChanged = true
    scheduleLayout()
  }
  const observer = new MutationObserver(records => {
    for (const { target, attributeName } of records) {
      if (attributeName === 'data-following' && target.matches(viewportSelector) && target.closest(mainGroup) &&
          root.matches(active) && !forcedColors.matches) rememberFollowing(target)
    }
    let visibilityChanged = false
    const structureChanged = records.some(record => {
      if (record.type === 'attributes') {
        const { target, attributeName } = record
        if (target === root || target.matches(promptSelector) ||
            (attributeName === 'data-popped-out' && target.matches('[data-slot="composer-dock"]'))) return true
        if (!visibilityChanged && (attributeName === 'hidden' || attributeName === 'data-pane-hidden')) {
          visibilityChanged = target.matches(chat) || Boolean(target.querySelector(chat))
        }
        return false
      }
      if (!root.matches(active)) return false
      if (record.target.closest?.(editSelector)) {
        return record.target.matches(editFrame) || record.target.matches(editSelector)
      }
      if (record.target.closest?.(promptSelector) && !record.target.closest(toggleSelector)) return true
      return [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node.matches(`${promptSelector}, ${viewportSelector}, ${editSelector}, ${chat}, [data-slot="composer-dock"], [data-slot="composer-surface"]`) ||
          node.querySelector(`${promptSelector}, ${viewportSelector}, ${editSelector}, ${chat}, [data-slot="composer-dock"], [data-slot="composer-surface"]`)),
      )
    })
    if (structureChanged) schedule()
    else if (visibilityChanged) scheduleLayout()
  })
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-hermes-theme', 'data-hermes-codex-visual', 'data-message-id', 'data-popped-out', 'hidden', 'data-pane-hidden', 'data-following'],
  })
  ctx.addEventListener(document, 'wheel', rememberReadingPosition, { capture: true, passive: true })
  ctx.addEventListener(document, 'pointerdown', rememberReadingPosition, true)
  ctx.addEventListener(document, 'keydown', rememberReadingPosition, true)
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
    composerMetrics.dispose(sizes)
    suspendOlderTranscript([])
    sizes.disconnect()
    stylesheet.remove()
  })
  schedule()
}

