import { chatStyles, mountCSS } from './style-scope.js'

const frame = '[data-slot="composer-bounds"]'
const rail = '[data-slot="thread-timeline"]'
const marker = 'button[data-timeline-id]'
const bar = '[data-slot="timeline-bar"]'
const tooltip = '[data-slot="tooltip-content"]'
const tipMarker = 'data-hcv-timeline-tip'

export function registerThreadTimeline(ctx, active) {
  if (!CSS.supports('position-area', 'span-right')) return
  const chatFrame = `${active} [data-chat-surface]:not([data-hud-shell] *) > ${frame}`
  const timeline = `${chatFrame} ${rail}`
  const tick = `${timeline} ${marker}`
  const card = `${tooltip}[${tipMarker}]`
  const wrapper = `${active} [data-radix-popper-content-wrapper]:has(> ${card})`
  mountCSS(ctx, 'data-hcv-thread-timeline-style', `
@media (forced-colors: none) {
  ${timeline} {
    /* Keep the native hit area where it fits. Give narrow panes' text
       priority over the empty part of the hit area. */
    --hcv-timeline-gutter: max(16px, calc((100% - var(--composer-width, 736px) - var(--hcv-summary-layout-inset, 0px)) / 2));
    --hcv-timeline-inset: clamp(0px, calc(var(--hcv-timeline-gutter) - 1.375rem), 10px);
    left: var(--hcv-timeline-inset);
    right: auto !important;
    width: min(3rem, calc(var(--hcv-timeline-gutter) - var(--hcv-timeline-inset)));
  }
  ${timeline} [data-slot="thread-timeline-ticks"] { width: 100%; }
  ${tick} {
    justify-content: left;
    padding: 0 0 0 clamp(0px, calc(100% - 1rem), .375rem);
  }
  /* Length follows the hovered row. The reading position still owns color. */
  ${tick} > ${bar} { width: var(--hcv-timeline-marker-width, .5rem) !important; }
  ${timeline} :is(${marker}:has(+ ${marker}:hover), ${marker}:hover + ${marker}) {
    --hcv-timeline-marker-width: .85rem;
  }
  ${timeline} :is(${marker}:has(+ ${marker} + ${marker}:hover), ${marker}:hover + ${marker} + ${marker}) {
    --hcv-timeline-marker-width: .7rem;
  }
  ${timeline} :is(
    ${marker}:has(+ ${marker} + ${marker} + ${marker}:hover),
    ${marker}:hover + ${marker} + ${marker} + ${marker}
  ) {
    --hcv-timeline-marker-width: .6rem;
  }
  ${tick}:hover, ${timeline}:not(:has(${marker}:hover)) ${marker}:focus-visible {
    --hcv-timeline-marker-width: 1rem;
  }

  ${chatFrame}:has(${rail} ${marker}[aria-describedby]) { anchor-name: --hcv-timeline-frame; }
  ${tick}[aria-describedby] { anchor-name: --hcv-timeline-button; }
  ${wrapper} {
    /* Anchor just past the longest painted mark, even when its button is wider. */
    --hcv-timeline-tip-start: calc(min(anchor-size(width), 1.375rem) + 10px);
    position-anchor: --hcv-timeline-button;
    inset: auto !important;
    position-area: span-all span-right;
    align-self: anchor-center;
    justify-self: start;
    margin: 8px 8px 8px var(--hcv-timeline-tip-start);
    width: max-content;
    min-width: 0 !important;
    max-width: min(calc(100% - var(--hcv-timeline-tip-start) - 8px),
      calc(anchor-size(--hcv-timeline-frame width, 100vw) - 28px - 1.375rem));
    transform: none !important;
  }
  ${wrapper} > ${card} { --radix-tooltip-content-available-width: 100% !important; }
}
`, chatStyles)

  let trigger, openTip
  const description = new MutationObserver(syncTip)
  function syncTip() {
    const id = trigger?.getAttribute('aria-describedby')
    const next = id && trigger.matches(tick) ? document.getElementById(id)?.closest(tooltip) : null
    if (next === openTip) return
    openTip?.removeAttribute(tipMarker)
    openTip = next
    openTip?.setAttribute(tipMarker, '')
  }

  function follow(event) {
    if (event.pointerType === 'touch') return
    const next = event.target.closest?.(tick)
    if (!next || next === trigger) return
    description.disconnect()
    trigger = next
    description.observe(trigger, { attributes: true, attributeFilter: ['aria-describedby'] })
    syncTip()
  }

  // The native tooltip still owns the delay, focus, dismissal and text.
  ctx.addEventListener(document, 'pointerover', follow, true)
  ctx.addEventListener(document, 'focusin', follow, true)
  ctx.onDispose(() => {
    description.disconnect()
    openTip?.removeAttribute(tipMarker)
  })
}
