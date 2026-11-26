// The renderer can remain visible to Chromium when the Hermes window is minimized.
export function observeWindowVisibility(onChange) {
  const root = document.documentElement
  const attribute = 'data-renderer-animations-paused'
  let nativeHidden = null
  let disposed = false
  let ready = false
  const hidden = () => document.hidden || (nativeHidden === null ? root.hasAttribute(attribute) : nativeHidden)
  let paused = hidden()
  const sync = () => {
    if (disposed) return
    const next = hidden()
    if (next === paused) return
    paused = next
    if (ready) onChange(next)
  }
  document.addEventListener('visibilitychange', sync)
  const observer = new MutationObserver(sync)
  observer.observe(root, { attributes: true, attributeFilter: [attribute] })
  const unsubscribe = window.hermesDesktop?.onWindowStateChanged?.(state => {
    if (typeof state?.isMinimized !== 'boolean' && typeof state?.isVisible !== 'boolean') return
    nativeHidden = state.isMinimized === true || state.isVisible === false
    sync()
  })
  ready = true
  return {
    hidden,
    dispose() {
      if (disposed) return
      disposed = true
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      if (typeof unsubscribe === 'function') unsubscribe()
    },
  }
}
