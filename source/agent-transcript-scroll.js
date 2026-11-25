// Codex 26.1117.4957.0, ThreadScrollLayout in 632620.21f2e5d141.js:
// no initialOffset means distance 0; user movement toward the bottom resumes
// following at <=24px. Content growth follows only while the viewport stays put.
export function attachAgentTranscriptScroll(viewport, Observer = ResizeObserver) {
  let following = true
  let initialized = false
  let top = viewport.scrollTop
  let height = viewport.scrollHeight
  let visible = viewport.clientHeight
  const distance = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop)
  const remember = () => {
    top = viewport.scrollTop
    height = viewport.scrollHeight
    visible = viewport.clientHeight
  }
  const layout = () => {
    if (viewport.clientHeight <= 0) return
    const bottom = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    const current = viewport.scrollTop
    const stayedPut = Math.abs(current - top) <= 1
    // Removing content can move scrollTop without any user navigation.
    const clampedToBottom = following && top > bottom && Math.abs(current - bottom) <= 1
    if (initialized && !stayedPut && !clampedToBottom) {
      following = current > top && distance() <= 24
    }
    if (!initialized || (following && (stayedPut || clampedToBottom))) {
      viewport.scrollTop = bottom
      initialized = true
    }
    remember()
  }
  const scroll = () => {
    // A resize can enqueue a scroll event before ResizeObserver. Account for
    // that layout before treating the event as a user's navigation.
    if (height !== viewport.scrollHeight || visible !== viewport.clientHeight) {
      layout()
      return
    }
    const current = viewport.scrollTop
    if (current !== top) following = current > top && distance() <= 24
    remember()
  }
  const nestedCanScrollUp = event => {
    for (const node of event.composedPath?.() || []) {
      if (node === viewport) break
      if (node?.nodeType !== 1 || node.scrollTop <= 0 || node.scrollHeight <= node.clientHeight) continue
      const overflow = node.ownerDocument?.defaultView?.getComputedStyle(node)?.overflowY
      if (overflow === 'auto' || overflow === 'scroll') return true
    }
    return false
  }
  const wheel = event => {
    if (!event.defaultPrevented && !event.ctrlKey && !event.shiftKey &&
        event.deltaY < 0 && Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
        viewport.scrollTop > 0 && !nestedCanScrollUp(event)) following = false
  }
  const keydown = event => {
    if (event.defaultPrevented || event.repeat) return
    const target = event.target
    if (target !== viewport && (target?.isContentEditable || target?.closest?.('input, select, textarea'))) return
    const space = event.key === ' ' || event.key === 'Spacebar'
    if (space && target !== viewport && target?.closest?.('button, [role="button"]')) return
    const away = ['ArrowUp', 'Home', 'PageUp'].includes(event.key) || space && event.shiftKey
    if (away && viewport.scrollTop > 0 && !nestedCanScrollUp(event)) following = false
  }
  viewport.addEventListener('scroll', scroll, { passive: true })
  viewport.addEventListener('wheel', wheel, { passive: true })
  viewport.addEventListener('keydown', keydown)
  const observer = new Observer(layout)
  observer.observe(viewport)
  if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
  layout()
  return () => {
    observer.disconnect()
    viewport.removeEventListener('scroll', scroll)
    viewport.removeEventListener('wheel', wheel)
    viewport.removeEventListener('keydown', keydown)
  }
}
