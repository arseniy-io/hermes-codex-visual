import { codexMask, codexReference as codex, localAssets, svgMask } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'
import { chatStyles, mountCSS } from './style-scope.js'

const chat = '[data-chat-surface]:not([data-hud-shell] *)'
const attachments = '[data-slot="composer-attachments"]'
const nativePill = 'div[class~="group/attachment"]'
const picture = '> button:first-child > span:first-child > :is(img, svg.tabler-icon-photo)'
const pill = `${nativePill}:has(${picture})`
const userMessage = '[data-slot="aui_user-message-root"]'
const directiveContent = '[data-slot="aui_directive-text"]'
const imageList = '[data-slot="aui_embedded-images"]'
const attachmentRow = 'div:not([data-slot])'
const imagePath = `> ${directiveContent} > ${imageList}`
const row = '[data-tool-row][data-slot="tool-block"]'
const group = '[data-tool-group][data-slot="tool-block"]'
const summary = '[data-tool-summary]'
const analysis = '[data-hcv-viewed-image]'
const analysisGroup = '[data-hcv-viewed-image-group]'
const strip = '[data-hcv-image-strip]'
const label = '[data-hcv-viewed-image-label]'
const stepTitle = '[class~="text-(--conversation-scaffold-text)"]'
const nativeDialog = '[data-slot="dialog-content"][data-variant="media-lightbox"]'
const enhanced = '[data-hcv-image-viewer]'
const lightboxImage = 'div[class~="group/lightbox"] > img'
const zoom = 'div[class~="fixed"][class~="bottom-4"]'
const close = '[data-hcv-image-close]'
const pager = '[data-hcv-image-page]'
const scrim = '[data-slot="dialog-overlay"]'
const dialogFocusRestored = 'focusScope.autoFocusOnUnmount'

function mask(name, fallback) {
  const original = localAssets?.icons[name]
  if (original) return svgMask(original)
  return fallback === 'minus'
    ? svgMask('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12h14" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>')
    : codexMask(fallback)
}

const viewedLabel = (count, ru) => {
  if (!ru) return count === 1 ? 'Viewed an image' : `Viewed ${count} images`
  if (count === 1) return 'Просмотрено изображение'
  const plural = new Intl.PluralRules('ru').select(count)
  return `Просмотрено ${count} ${{ one: 'изображение', few: 'изображения', many: 'изображений' }[plural]}`
}

const disclosureButton = step => step.querySelector(':scope > :first-child button[aria-expanded]')
const successfulVision = entry => {
  const part = committedFiber(entry)?.return?.memoizedProps?.part
  const toggle = disclosureButton(entry)
  // Error and running rows have accessible status glyphs and keep the Hermes
  // label. The native disclosure is the only source of image data.
  return part?.toolName === 'vision_analyze' && part.result !== undefined && !part.isError && !part.interrupted &&
    toggle && !toggle.querySelector('svg[aria-label], [role="status"]')
}

function hasPhotoOnly(entry) {
  const output = entry.children[1]
  return output?.querySelector(':scope > div > [data-slot="aui_markdown-image"]') &&
    Array.from(output.children).every(child => child.matches('button') ||
      child.querySelector(':scope > [data-slot="aui_markdown-image"]'))
}

function viewerOwner(dialog) {
  let changeOpen, kind
  for (let fiber = committedFiber(dialog); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (!changeOpen && props?.copy?.resetZoom && typeof props.onOpenChange === 'function') changeOpen = props.onOpenChange
    if (!changeOpen) continue
    if (props?.attachment?.kind === 'image') kind = 'draft'
    if (props?.part?.toolName === 'vision_analyze') kind = 'activity'
    if (kind && fiber.stateNode instanceof Element &&
      fiber.stateNode.matches(kind === 'draft' ? '[data-slot="composer-surface"]:not([data-hud-shell] *)' : chat)) {
      return { kind, changeOpen }
    }
  }
  return null
}

export function registerChatImages(ctx, active) {
  const root = document.documentElement
  const composer = `${active} [data-slot="composer-surface"]:not([data-hud-shell] *)`
  const rail = `${composer} ${attachments}:has(> ${nativePill} ${picture})`
  const card = `${composer} ${attachments} > ${pill}`
  const open = `${card} > button:first-child`
  const remove = `${card} > button:nth-child(2)`
  const sentTurn = `${active} ${chat} [data-slot="aui_turn-pair"]`
  // The turn may insert a stop notice between the prompt and the native row.
  const sentRow = `${sentTurn} > ${userMessage} ~ ${attachmentRow}:has(${imagePath})`
  const sentContent = `${sentRow} > ${directiveContent}`
  const sentImages = `${sentContent} > ${imageList}`
  const imageOnlyRow = `${sentRow}:not(:has(> ${directiveContent} > :not(${imageList})))`
  const sentTile = `${sentImages} > :is([data-slot="aui_directive-image"], [data-slot="aui_embedded-image"])`
  const sentButton = `${sentTile} > button:first-child`
  const step = `${active} ${chat} ${row}${analysis}`
  const run = `${active} ${chat} ${group}${analysisGroup}`
  const header = `:is(${step} > div:first-child, ${run} > ${summary})`
  const toggle = `${header} > div > button[aria-expanded]`
  const caret = `${toggle} > span:nth-child(2) > .codicon-chevron-right`
  const stepLabel = `${header} ${label}`
  const rowIcon = `${step} > div:first-child span.self-center > :is(svg, .codicon)`
  const body = `${step}[data-tool-open] > div:nth-child(2)`
  const thumb = `${body} > div > [data-slot="aui_markdown-image"]`
  const gallery = `${run} > ${summary}:has(button[aria-expanded="true"]) + ${strip}`
  const dialog = `${active} ${nativeDialog}${enhanced}`
  const save = `${dialog} div[class~="group/lightbox"] > button`
  const exit = `${dialog} > ${close}`
  const turnPage = `${dialog} > ${pager}`
  const zoomBar = `${dialog} > ${zoom}`
  const draft = `${dialog}[data-hcv-image-viewer="draft"]`
  const activity = `${dialog}[data-hcv-image-viewer="activity"]`
  const buttons = `${dialog} :where(div[class~="group/lightbox"] > button, ${close}, ${pager})`
  const symbol = (selector, glyph, fallback, size) => `
    ${selector}::before {
      content: ""; display: block; inline-size: ${size}px; block-size: ${size}px;
      background: currentColor; mask: ${mask(glyph, fallback)} center / contain no-repeat;
    }`

  mountCSS(ctx, 'data-hcv-chat-images', `
    ${close}, ${pager}, ${label} { display: none; }
    /* Desktop GL6x.BW/ep in 407859.bb57f12697.js: sent uploads have a separate
       right-aligned 80px rail above the message. Preserve native DOM order. */
    ${sentTurn}:has(> ${userMessage} ~ ${attachmentRow} ${imagePath}), ${sentContent} {
      reading-flow: flex-visual;
    }
    ${sentRow} {
      order: -1; justify-content: flex-end; min-inline-size: 0;
      margin-block: 0;
    }
    ${sentTurn} > ${userMessage}:has(~ ${attachmentRow} ${imagePath}) { padding-block-start: 0; }
    ${sentContent} {
      display: flex; flex-wrap: wrap; justify-content: flex-end;
      min-inline-size: 0; inline-size: 100%; gap: 8px 4px;
    }
    ${sentImages} {
      order: -1; flex: 0 0 100%; flex-wrap: nowrap; align-items: end; justify-content: safe flex-end; gap: 8px;
      margin-block-start: 0; min-inline-size: 0; min-block-size: 80px;
      overflow-x: auto; overflow-y: hidden; scrollbar-width: none;
    }
    ${imageOnlyRow} {
      flex-direction: row-reverse; justify-content: flex-start;
      overflow-x: auto; overflow-y: hidden; scrollbar-width: none;
    }
    ${imageOnlyRow} > ${directiveContent} { flex: none; inline-size: max-content; }
    ${sentTile}, ${sentImages} > span[aria-hidden="true"][class~="animate-pulse"] {
      flex: none; inline-size: 80px; block-size: 80px; border-radius: 10px;
    }
    ${sentButton} {
      display: block; box-sizing: border-box; inline-size: 100%; block-size: 100%;
      border: 1px solid; border-radius: inherit; padding: 0;
    }
    ${sentButton} > img {
      display: block; inline-size: 100%; block-size: 100%; max-block-size: none;
      border: 0; border-radius: 8px; object-fit: cover; outline: none;
    }
    @media (forced-colors: none) {
      /* The turn's 16px gap is 8px above the bubble in Codex. */
      ${sentRow} { margin-block-end: -8px; }
      ${sentButton} { border-color: light-dark(color-mix(in oklab, var(--hcv-text) 12%, transparent), #ffffff29); }
      ${sentButton}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
      ${rail} {
        flex-wrap: nowrap; align-items: end; gap: 8px; padding: 4px;
        overflow-x: auto; overflow-y: hidden; scrollbar-width: none;
      }
      ${card} { inline-size: 122px; block-size: 122px; border-radius: 10px; }
      ${open} {
        display: block; position: relative; inline-size: 100%; block-size: 100%;
        border: 0; padding: 0; border-radius: inherit; overflow: hidden;
        background: var(--hcv-hover); box-shadow: none;
      }
      ${open} > span:first-child {
        inline-size: 100%; block-size: 100%; border: 0; border-radius: inherit; background: transparent;
      }
      ${open} > span:nth-child(2) { display: none; }
      ${open} > span:first-child > img { display: block; inline-size: 100%; block-size: 100%; object-fit: cover; }
      ${open}::after {
        content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
        box-shadow: inset 0 0 0 1px light-dark(#0d0d0d1a, #ffffff1a);
      }
      ${card}:is(:hover, :focus-within) > button:first-child::after {
        background: color-mix(in srgb, var(--hcv-text) 5%, transparent);
        box-shadow: inset 0 0 0 1px light-dark(#0d0d0d26, #fff3);
      }
      ${remove} {
        inset: -2px -2px auto auto; inline-size: 16px; block-size: 16px;
        border: 0; background: var(--hcv-text); color: var(--hcv-composer);
        box-shadow: 0 0 0 2px var(--hcv-bg, var(--hcv-composer)), 0 1px 2px -1px #00000014;
        opacity: 0; pointer-events: none; transition: none;
      }
      ${remove}:hover { background: color-mix(in srgb, var(--hcv-text) 80%, transparent); color: var(--hcv-composer); }
      ${card}:hover > button:nth-child(2), ${card}:has(:focus-visible) > button:nth-child(2) {
        opacity: 1; pointer-events: auto;
      }
      ${remove} > * { display: none; }
      ${symbol(remove, 'composerRemoveImage', 'close', 12)}
      ${open}:focus-visible, ${remove}:focus-visible {
        outline: 2px solid var(--hcv-focus); outline-offset: -2px;
      }
      @media (hover: none) { ${remove} { opacity: 1; pointer-events: auto; } }
      ${active} [data-hcv-image-path-tip] { visibility: hidden; }

      ${header} { --conversation-scaffold-text: light-dark(#6c6c6c, #8b8b8b); opacity: 1; }
      ${toggle} { align-items: center; gap: 4px; border-radius: 8px; }
      ${toggle} > span:first-child > span:first-child { gap: 8px; }
      ${stepLabel} {
        display: block; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        color: var(--conversation-scaffold-text);
      }
      ${stepLabel} ~ ${stepTitle} { display: none; }
      ${rowIcon} {
        mask: ${mask('viewedImages', 'image')} center / contain no-repeat;
        color: light-dark(#6c6c6c, #8b8b8b);
      }
      ${run} > ${summary} ${label} { position: relative; padding-inline-start: 24px; }
      ${symbol(`${run} > ${summary} ${label}`, 'viewedImages', 'image', 16)}
      ${run} > ${summary} ${label}::before {
        position: absolute; inset-inline-start: 0; inset-block-start: 50%; translate: 0 -50%;
        color: light-dark(#6c6c6c, #8b8b8b);
      }
      ${caret} {
        inline-size: 14px !important; block-size: 14px !important;
        color: var(--conversation-scaffold-text);
        mask: ${mask('viewedImageChevron', 'right')} center / contain no-repeat;
        rotate: none; transform: rotate(0deg);
        transition: transform 300ms var(--hcv-ease);
      }
      ${toggle}[aria-expanded="true"] > span:nth-child(2) > .codicon-chevron-right { transform: rotate(90deg); }
      ${toggle}[aria-expanded="false"]:not(:hover, :focus-visible) > span:nth-child(2) { opacity: 0; }
      ${toggle}[aria-expanded="true"] > span:nth-child(2) { opacity: 1; }
      ${body} { margin-block-start: 8px; padding-block-end: 4px; }
      ${thumb} {
        inline-size: 80px !important; block-size: 80px; margin: 0;
        border: 1px solid light-dark(#0d0d0d26, #fff3); border-radius: 10px; overflow: hidden;
      }
      ${thumb} > span, ${thumb} [data-slot="aui_zoomable-image"] > button:first-child { inline-size: 100%; block-size: 100%; }
      ${thumb} img { inline-size: 100%; block-size: 100%; object-fit: cover; border-radius: 8px; box-shadow: none; }
      ${thumb} [data-slot="aui_zoomable-image"] > button:nth-child(2) { display: none; }
      ${gallery} {
        display: flex; align-items: start; gap: 8px; overflow: auto hidden; scrollbar-width: none;
        margin: 0; padding: 4px 0; border: 0;
      }
      ${gallery} > ${analysis} { flex: 0 0 80px; }
      ${gallery} > ${analysis} > div:first-child { display: none; }
      ${gallery} > ${analysis} > div:nth-child(2) { margin: 0; padding: 0; }
      ${gallery} > ${analysis} > div:nth-child(2) > button { display: none; }
      @keyframes hcv-image-details-in { from { opacity: 0; block-size: 0; } to { block-size: auto; } }
      ${step}:not(${strip} *)[data-tool-open] > div:nth-child(2),
      ${gallery} { interpolate-size: allow-keywords; animation: hcv-image-details-in 300ms ${codex.enter} both; }

      ${active} ${scrim}:has(+ ${nativeDialog}[data-hcv-image-viewer="activity"]) { background: rgb(0 0 0 / .9); backdrop-filter: none; }
      ${active} ${scrim}:has(+ ${nativeDialog}[data-hcv-image-viewer="draft"]) { background: rgb(0 0 0 / .62); backdrop-filter: blur(2px); }
      ${dialog} {
        --hcv-image-control-fill: light-dark(#ededed, #282828);
        --hcv-image-control-ink: light-dark(#0d0d0d, #dfdfdf);
        --hcv-image-side: clamp(16px, 4vw, 32px);
        --hcv-image-top: 96px;
        --hcv-image-bottom: 32px;
        --hcv-image-controls-space: 64px;
        display: grid; position: fixed; inset: 0; translate: none; transform: none;
        inline-size: 100%; max-inline-size: none; block-size: 100%; max-block-size: none;
        grid-template-rows: minmax(0, 1fr) auto; gap: 20px;
        padding: var(--hcv-image-top) var(--hcv-image-side) var(--hcv-image-bottom);
        border: 0; border-radius: 0; overflow: hidden; pointer-events: none !important;
      }
      ${draft} {
        --hcv-image-top: 48px; --hcv-image-bottom: 72px; --hcv-image-controls-space: 0px;
        --hcv-image-control-fill: light-dark(#ededed, #2d2d2d); grid-template-rows: minmax(0, 1fr);
        --hcv-image-controls-edge: max(12px, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 8px));
      }
      @media (max-height: 500px) {
        ${activity} { --hcv-image-top: 76px; --hcv-image-bottom: 12px; --hcv-image-controls-space: 52px; gap: 8px; }
        ${draft} { --hcv-image-bottom: 30px; }
      }
      ${dialog} > div:first-child {
        display: grid; place-items: center; overflow: clip; padding: 0; border-radius: 0;
      }
      ${dialog} ${lightboxImage} {
        max-inline-size: calc(100vw - 2 * var(--hcv-image-side));
        max-block-size: calc(100dvh - var(--hcv-image-top) - var(--hcv-image-bottom) - var(--hcv-image-controls-space));
        border-radius: 10px; box-shadow: none; pointer-events: auto;
      }
      ${dialog} div[class~="group/lightbox"] { display: grid; place-items: center; min-block-size: 0; max-block-size: 100%; position: static; }
      ${buttons}, ${zoomBar} {
        color: var(--hcv-image-control-ink); background: var(--hcv-image-control-fill);
        border: 0; border-radius: 999px; pointer-events: auto; backdrop-filter: none;
        box-shadow: 0 2px 4px -1px #00000014, 0 0 0 1px #0000000d;
        -webkit-app-region: no-drag;
      }
      ${buttons} {
        display: grid; place-items: center; position: fixed; z-index: 2;
        inset-block-start: 48px; inset-inline-end: 12px;
        block-size: 40px; inline-size: 40px; padding: 0; opacity: 1;
        transition: transform 150ms ease; cursor: pointer;
      }
      ${save} { inset-inline-end: 60px; }
      ${dialog}:has(> ${pager}) { --hcv-image-side: clamp(44px, 6vw, 72px); }
      ${turnPage} { inset-block: 50% auto; inset-inline: auto 12px; translate: 0 -50%; }
      ${turnPage}[data-hcv-image-page="previous"] { inset-inline: 12px auto; }
      ${turnPage}[data-hcv-image-page="previous"]::before { scale: -1 1; }
      ${draft} :is(${close}, div[class~="group/lightbox"] > button) { inset-block-start: 7px; block-size: 34px; inline-size: 34px; }
      ${draft} > ${close} { inset-inline-end: var(--hcv-image-controls-edge); }
      ${draft} div[class~="group/lightbox"] > button { inset-inline-end: calc(var(--hcv-image-controls-edge) + 42px); }
      ${buttons}:hover { background: light-dark(#fff, #353535); outline: 1px solid var(--hcv-focus); }
      ${buttons}:active { transform: scale(.95); }
      ${save} > svg, ${zoomBar} > button:is(:first-child, :last-child) > svg { display: none; }
      ${symbol(save, 'imagePreviewDownload', 'download', 16)}
      ${symbol(exit, 'imagePreviewClose', 'close', 18)}
      ${symbol(turnPage, 'viewedImageChevron', 'right', 18)}
      ${zoomBar} { position: static; translate: none; justify-self: center; gap: 4px; padding: 4px; }
      ${zoomBar} > button:is(:first-child, :last-child) {
        display: grid; place-items: center; inline-size: 36px; block-size: 36px;
        border-radius: 50%; background: color-mix(in srgb, currentColor 10%, transparent); color: inherit;
      }
      ${zoomBar} > button:nth-child(2) { min-inline-size: 64px; font: 400 14px / 20px ${codex.font}; font-variant-numeric: tabular-nums; color: inherit; }
      ${draft} > ${zoom} { position: fixed; inset: 7px calc(var(--hcv-image-controls-edge) + 82px) auto auto; z-index: 2; }
      @media (max-width: 520px) {
        ${draft} > ${zoom} { inset: auto auto 12px 50%; translate: -50% 0; }
      }
      ${draft} > ${zoom} > button:is(:first-child, :last-child) { inline-size: 26px; block-size: 26px; }
      ${draft} > ${zoom} > button:nth-child(2) { min-inline-size: 48px; }
      ${symbol(`${zoomBar} > button:first-child`, 'imagePreviewMinus', 'minus', 16)}
      ${symbol(`${zoomBar} > button:last-child`, 'imagePreviewPlus', 'plus', 16)}
      :is(${buttons}, ${zoomBar} > button):focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
      @keyframes hcv-image-fade { from { opacity: 0; } }
      @keyframes hcv-image-fade-out { to { opacity: 0; } }
      ${dialog}[data-state="open"] { animation: hcv-image-fade ${codex.enterTime} ${codex.enter} both; }
      ${dialog}[data-state="closed"] { animation: hcv-image-fade-out ${codex.exitTime} ${codex.exit} both; }
      @media (prefers-reduced-motion: reduce) {
        ${caret}, ${buttons} { transition: none; }
        ${gallery}, ${body}, ${dialog}[data-state], ${active} ${scrim}:has(+ ${nativeDialog}${enhanced}) { animation: none; }
      }
    }
  `, chatStyles)

  const marked = new Set()
  const pending = new Set()
  const selectors = `${row}, ${group}, ${nativeDialog}, ${attachments} > ${pill}`
  const markedSelector = `${analysis}, ${analysisGroup}, ${strip}, ${label}, ${enhanced}, ${close}, ${pager}, [data-hcv-image-path-tip]`
  const colors = matchMedia('(forced-colors: active)')
  let frame = 0
  let prune = false
  let opener = null
  let nextImage = null
  const dialogKeys = new WeakMap()
  const dialogFocus = new WeakMap()

  function mark(node, attribute, value = '') {
    if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value)
    marked.add(node)
  }

  function decorate(button, count) {
    const original = button?.querySelector(stepTitle)
    if (!original) return false
    let text = original.previousElementSibling
    if (!text?.matches(label)) {
      text = document.createElement('span')
      text.setAttribute('data-hcv-viewed-image-label', '')
      original.before(text)
      marked.add(text)
    }
    const content = viewedLabel(count, root.matches(':lang(ru)'))
    if (text.textContent !== content) text.textContent = content
    return true
  }

  function addViewerControls(node, owner) {
    mark(node, 'data-hcv-image-viewer', owner.kind)
    const ru = root.matches(':lang(ru)')
    if (!node.hasAttribute('aria-label')) {
      node.setAttribute('aria-label', ru ? 'Просмотр изображения' : 'Image preview')
      mark(node, 'data-hcv-image-dialog-label')
    }
    const closeViewer = () => (viewerOwner(node) ?? owner).changeOpen(false)
    const add = (attribute, value, description, action) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('aria-label', description)
      button.setAttribute(attribute, value)
      button.addEventListener('click', event => { event.stopPropagation(); action() })
      node.append(button)
      marked.add(button)
      return button
    }
    add('data-hcv-image-close', '', ru ? 'Закрыть' : 'Close', closeViewer)
    const trigger = opener
    opener = null
    if (trigger) {
      const onRestore = () => {
        if (nextImage?.from !== node) return
        const { target } = nextImage
        nextImage = null
        // Wait for Hermes to close the current dialog and restore focus
        // before asking the next native thumbnail to open.
        queueMicrotask(() => {
          if (!root.matches(active) || colors.matches || !target.isConnected || !target.getClientRects().length ||
            document.querySelector('[role="dialog"][data-state="open"]')) return
          target.focus({ preventScroll: true })
          target.click()
        })
      }
      dialogFocus.set(node, onRestore)
      node.addEventListener(dialogFocusRestored, onRestore, { once: true })
    }
    const container = owner.kind === 'draft' ? trigger?.closest(attachments) : trigger?.closest(strip)
    const candidates = container && [...container.querySelectorAll(owner.kind === 'draft'
      ? `:scope > ${pill} > button:first-child:not(:disabled)`
      : '[data-slot="aui_zoomable-image"] > button:first-child:not(:disabled)')]
    const index = candidates?.indexOf(trigger) ?? -1
    if (index < 0) return
    const pairs = [
      [candidates[index - 1], 'previous', 'ArrowLeft', ru ? 'Предыдущее изображение' : 'Previous image'],
      [candidates[index + 1], 'next', 'ArrowRight', ru ? 'Следующее изображение' : 'Next image'],
    ]
    const arrowKeys = new Map()
    for (const [target, direction, key, description] of pairs) {
      if (!target) continue
      const pageImage = () => {
        if (nextImage || node.dataset.state !== 'open') return
        nextImage = { from: node, target }
        closeViewer()
      }
      add('data-hcv-image-page', direction, description, pageImage)
      arrowKeys.set(key, pageImage)
    }
    if (arrowKeys.size) {
      const onKey = event => {
        const pageImage = arrowKeys.get(event.key)
        if (!pageImage || event.defaultPrevented || event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return
        event.preventDefault()
        pageImage()
      }
      dialogKeys.set(node, onKey)
      node.addEventListener('keydown', onKey)
    }
  }

  function flush() {
    frame = 0
    for (const node of pending) {
      if (!node.isConnected) continue
      if (node.matches(row) && node.closest(chat)) {
        if (successfulVision(node) && decorate(disclosureButton(node), 1)) mark(node, 'data-hcv-viewed-image')
        else {
          node.removeAttribute('data-hcv-viewed-image')
          marked.delete(node)
          node.querySelector(label)?.remove()
        }
      } else if (node.matches(group) && node.closest(chat)) {
        const heading = node.querySelector(`:scope > ${summary}`)
        const button = heading?.querySelector('button[aria-expanded]')
        // The host reports this English count for homogeneous vision runs.
        // Mixed tool runs and failure details keep their original structure.
        const count = Number(button?.querySelector(stepTitle)?.textContent.match(/^Analyzed (\d+) images$/)?.[1])
        const details = heading?.nextElementSibling
        if (count > 1 && decorate(button, count)) mark(node, 'data-hcv-viewed-image-group')
        else {
          node.removeAttribute('data-hcv-viewed-image-group')
          marked.delete(node)
          heading?.querySelector(label)?.remove()
          details?.removeAttribute('data-hcv-image-strip')
          marked.delete(details)
          continue
        }
        const rows = details && !details.hasAttribute('data-tool-ticker') ? Array.from(details.children) : []
        const eligible = count > 1 && rows.length === count && rows.every(item => item.matches(row) && successfulVision(item))
        if (eligible && rows.every(hasPhotoOnly)) {
          mark(details, 'data-hcv-image-strip')
        } else {
          details?.removeAttribute('data-hcv-image-strip')
          marked.delete(details)
          if (eligible) {
            for (const item of rows) {
              const inner = disclosureButton(item)
              if (inner?.getAttribute('aria-expanded') === 'false') inner.click()
            }
          }
        }
      } else if (node.matches(nativeDialog) && !node.matches(enhanced)) {
        const owner = viewerOwner(node)
        if (owner && node.querySelector(lightboxImage)) addViewerControls(node, owner)
      } else if (node.matches(pill) && node.closest(attachments)) {
        const tooltip = document.getElementById(node.getAttribute('aria-describedby'))
        const container = tooltip?.closest('[data-slot="tooltip-content"]')
        if (container) mark(container, 'data-hcv-image-path-tip')
      }
    }
    pending.clear()
    if (prune) {
      prune = false
      for (const node of marked) if (!node.isConnected) marked.delete(node)
      if (opener && !opener.isConnected) opener = null
      // A connected next thumbnail still needs the detached dialog's native
      // focus-restored event. Keep that handoff alive until onRestore runs.
      if (nextImage && !nextImage.target.isConnected) nextImage = null
    }
  }

  function collect(node) {
    if (!(node instanceof Element)) return
    if (node.matches(selectors)) pending.add(node)
    for (const child of node.querySelectorAll(selectors)) pending.add(child)
  }
  function queue() { if (!frame && (pending.size || prune)) frame = requestAnimationFrame(flush) }
  const changes = new MutationObserver(records => {
    for (const { target, addedNodes, removedNodes, type } of records) {
      const element = target instanceof Element ? target : target.parentElement
      const parent = element?.closest(selectors)
      if (parent) pending.add(parent)
      const toolRun = parent?.matches(row) && parent.closest(group)
      if (toolRun) pending.add(toolRun)
      if (type === 'childList') {
        for (const child of addedNodes) collect(child)
        // Text tokens and unrelated removals do not walk every image marker.
        // A pure removal must release old image trees even without new work.
        if (!prune && marked.size) for (const child of removedNodes) {
          if (child instanceof Element && (marked.has(child) || child.querySelector(markedSelector))) {
            prune = true
            break
          }
        }
      }
    }
    queue()
  })
  function clear() {
    changes.disconnect()
    cancelAnimationFrame(frame)
    frame = 0
    prune = false
    opener = nextImage = null
    pending.clear()
    for (const node of marked) {
      if (node.matches(`${label}, ${close}, ${pager}`)) node.remove()
      else {
        if (dialogKeys.has(node)) node.removeEventListener('keydown', dialogKeys.get(node))
        if (dialogFocus.has(node)) node.removeEventListener(dialogFocusRestored, dialogFocus.get(node))
        if (node.hasAttribute('data-hcv-image-dialog-label')) node.removeAttribute('aria-label')
        for (const attribute of ['data-hcv-viewed-image', 'data-hcv-viewed-image-group', 'data-hcv-image-strip',
          'data-hcv-image-viewer', 'data-hcv-image-dialog-label', 'data-hcv-image-path-tip']) node.removeAttribute(attribute)
      }
    }
    marked.clear()
  }
  function sync() {
    clear()
    if (!root.matches(active) || colors.matches) return
    changes.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['aria-expanded', 'aria-describedby'],
    })
    collect(document.body)
    flush()
  }
  const theme = new MutationObserver(sync)
  theme.observe(root, { attributes: true, attributeFilter: ['lang', 'data-hermes-theme'] })
  colors.addEventListener('change', sync)
  ctx.addEventListener(document, 'click', event => {
    if (!root.matches(active) || colors.matches) return
    const button = event.target instanceof Element ? event.target.closest('button') : null
    opener = button?.matches(`${card} > button:first-child, ${gallery} [data-slot="aui_zoomable-image"] > button:first-child`)
      ? button : null
  }, { capture: true })
  sync()
  ctx.onDispose(() => {
    theme.disconnect()
    colors.removeEventListener('change', sync)
    clear()
  })
}
