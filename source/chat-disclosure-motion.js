import { codexReference } from './codex-reference.js'

export const disclosureMotion = 'data-hcv-activity-motion'
const marker = disclosureMotion
const closing = 'closing'
const duration = 300
const flat = { blockSize: '0px', paddingBlockStart: '0px', paddingBlockEnd: '0px',
  borderBlockStartWidth: '0px', borderBlockEndWidth: '0px', marginBlockStart: '0px', marginBlockEnd: '0px', opacity: '0' }

function frameOf(panel) {
  const css = getComputedStyle(panel)
  return { ...Object.fromEntries(Object.keys(flat).map(property => [property, css[property]])), translate: css.translate }
}

export function registerDisclosureMotion(ctx, enabled, getPanels, prepare) {
  const preference = matchMedia('(prefers-reduced-motion: no-preference)')
  const current = new Map()

  function clear(button, state) {
    current.delete(button)
    cancelAnimationFrame(state.frame)
    button.removeAttribute(marker)
    for (const { panel, animation } of state.panels) {
      animation.cancel()
      panel.removeAttribute(marker)
    }
  }

  function play(button, panels, phase, from) {
    const turn = button.hasAttribute('data-hcv-turn-line')
    panels = panels.filter(panel => panel.getClientRects().length > 0)
    const ends = panels.map(panel => frameOf(panel))
    const state = { phase, panels: [], frame: 0 }
    current.set(button, state)
    button.setAttribute(marker, phase)
    for (const [index, panel] of panels.entries()) {
      panel.setAttribute(marker, phase)
      const end = ends[index]
      const folded = turn ? { ...flat, translate: '0 -8px' } : flat
      const frames = phase === closing ? [from?.get(panel) ?? end, folded] : [from?.get(panel) ?? folded, end]
      const quickExit = turn && phase === closing
      const animation = panel.animate(frames, { duration: quickExit ? 150 : duration,
        easing: quickExit ? 'cubic-bezier(.23,1,.32,1)' : codexReference.enter, fill: 'both' })
      state.panels.push({ panel, animation })
    }
    void Promise.all(state.panels.map(({ animation }) => animation.finished)).then(() => {
      if (current.get(button) !== state) return
      // The native handlers keep control of disclosure state and focus. Run
      // the close after the outgoing content has finished its transition.
      if (phase === closing && button.isConnected && button.getAttribute('aria-expanded') === 'true') button.click()
      clear(button, state)
    }, () => {})
  }

  ctx.addEventListener(document, 'click', event => {
    if (!event.isTrusted || !enabled() || !preference.matches || !(event.target instanceof Element)) return
    const button = event.target.closest('button[aria-expanded]:not(:disabled)')
    if (!button || button.closest('[hidden], [data-pane-hidden], [inert]')) return
    const panels = getPanels(button)
    if (!panels) return
    const previous = current.get(button)
    const from = previous?.panels.length
      ? new Map(previous.panels.map(({ panel }) => [panel, frameOf(panel)]))
      : null
    if (previous) clear(button, previous)
    const reverse = previous?.phase === closing
    if (button.getAttribute('aria-expanded') === 'true' && panels.length) {
      for (const [child, state] of current) if (panels.some(panel => panel.contains(child))) clear(child, state)
      event.preventDefault()
      event.stopImmediatePropagation()
      play(button, panels, reverse ? 'opening' : closing, from)
      return
    }
    const state = { phase: 'opening', panels: [], frame: 0 }
    current.set(button, state)
    state.frame = requestAnimationFrame(() => {
      current.delete(button)
      if (!enabled() || !preference.matches || !button.isConnected || button.getAttribute('aria-expanded') !== 'true') return
      prepare()
      const mounted = getPanels(button)
      if (mounted?.length) play(button, mounted, 'opening')
    })
  }, true)

  function finish() {
    for (const [button, state] of current) {
      if (state.phase === closing && button.isConnected && button.getAttribute('aria-expanded') === 'true') button.click()
      clear(button, state)
    }
  }

  ctx.addEventListener(preference, 'change', finish)
  const observer = new MutationObserver(() => { if (!enabled()) finish() })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  ctx.onDispose(() => { observer.disconnect(); finish() })
}
