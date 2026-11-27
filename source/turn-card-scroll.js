// Codex 26.1117.4957.0: nMdB.I keeps the clicked card header stationary
// as the turn changes height, and stops as soon as the user scrolls away.
const active = new WeakMap()
const quietMs = 350
const maxAnchorMs = 1200

export function anchorTurnCard(header) {
  const viewport = header?.closest('[data-slot="aui_thread-viewport"], [data-hcv-subagent-feed]')
  const turn = header?.closest('[data-slot="aui_turn-pair"], [data-hcv-agent-turn]')
  return keepTurnCardHeader(header, viewport, turn)
}

export function keepTurnCardHeader(header, viewport, turn) {
  if (!header || !viewport || !turn) return
  const previous = active.get(viewport)
  if (previous?.header === header) { previous.renew(); return previous.stop }
  previous?.stop()
  const view = header.ownerDocument.defaultView
  const originalTop = header.getBoundingClientRect().top
  let lastMovement = -Infinity, deadline = 0, timer, frame = null, stopped = false
  const correct = () => {
    if (!header.isConnected || !viewport.contains(header) || header.closest('[hidden], [data-pane-hidden], [inert]')) {
      stop()
      return
    }
    const offset = header.getBoundingClientRect().top - originalTop
    if (offset) {
      lastMovement = view.performance.now()
      viewport.scrollTop += offset
    }
  }
  const schedule = () => {
    if (!stopped && frame == null) frame = view.requestAnimationFrame(() => { frame = null; correct() })
  }
  const observer = new view.ResizeObserver(() => {
    lastMovement = view.performance.now()
    if (frame != null) { view.cancelAnimationFrame(frame); frame = null }
    correct(); schedule()
  })
  observer.observe(turn)
  // Hermes may follow a growing transcript one frame after ResizeObserver.
  // Let native follow settle after its last correction. It can continue
  // writing after the turn itself has stopped resizing.
  const scrolled = () => schedule()
  viewport.addEventListener('scroll', scrolled, { passive: true })
  const stop = () => {
    if (stopped) return
    stopped = true
    if (frame != null) view.cancelAnimationFrame(frame)
    observer.disconnect()
    viewport.removeEventListener('scroll', scrolled)
    view.clearTimeout(timer)
    for (const event of ['wheel', 'touchmove', 'pointerdown', 'keydown']) viewport.removeEventListener(event, input)
    if (active.get(viewport)?.stop === stop) active.delete(viewport)
  }
  const timeout = () => {
    const remaining = Math.min(lastMovement + quietMs, deadline) - view.performance.now()
    if (remaining > 0) timer = view.setTimeout(timeout, Math.ceil(remaining))
    else stop()
  }
  const renew = () => {
    view.clearTimeout(timer)
    deadline = view.performance.now() + maxAnchorMs
    timer = view.setTimeout(timeout, quietMs)
    schedule()
  }
  const input = event => {
    const onHeader = header.contains(event.target)
    if (onHeader && (event.type === 'pointerdown' && event.button === 0 ||
      event.type === 'keydown' && (event.key === 'Enter' || event.key === ' '))) renew()
    else stop()
  }
  for (const event of ['wheel', 'touchmove', 'pointerdown', 'keydown']) viewport.addEventListener(event, input, { passive: true })
  active.set(viewport, { header, stop, renew })
  renew()
  return stop
}
