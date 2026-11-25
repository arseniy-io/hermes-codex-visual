// Exact geometry for each ordinary, docked chat surface. Hermes deliberately
// buckets its public composer metrics to 8px. Keep those native values intact;
// these private properties only control the Codex transcript's clearance.
export function createComposerClearanceMetrics() {
  const states = new Map()
  const owners = new Map()
  const dockProperty = '--hcv-composer-dock-height'
  const editorProperty = '--hcv-composer-surface-height'

  function clear(state) {
    state.root.style.removeProperty(dockProperty)
    state.root.style.removeProperty(editorProperty)
  }
  function detach(state, observer) {
    observer.unobserve(state.dock)
    observer.unobserve(state.editor)
    owners.delete(state.dock)
    owners.delete(state.editor)
    clear(state)
    states.delete(state.root)
  }
  function write(root, property, height) {
    const value = `${height}px`
    if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value)
  }
  function measure(state) {
    const { root, dock, editor } = state
    if (!root.isConnected || !dock.isConnected || !editor.isConnected || dock.hasAttribute('data-popped-out')) return clear(state)
    // Retain the last visible measurements when Hermes hides a mounted chat.
    // Clearing and rewriting the inherited values restyles the transcript.
    if (root.closest('[hidden], [data-pane-hidden]')) return
    // getBoundingClientRect includes CSS zoom. Properties are lengths in the
    // owning surface's coordinate space, as is the 32px transcript gap.
    const zoom = Number(root.currentCSSZoom) || 1
    const dockHeight = dock.getBoundingClientRect().height / zoom
    const editorHeight = editor.getBoundingClientRect().height / zoom
    if (!(dockHeight > 0) || !(editorHeight > 0)) return clear(state)
    write(root, dockProperty, dockHeight)
    write(root, editorProperty, editorHeight)
  }

  return {
    sync(roots, observer) {
      const seen = new Set()
      for (const root of roots) {
        if (root.closest('[data-hud-shell]')) continue
        const dock = root.querySelector('[data-slot="composer-dock"]:not([data-popped-out])')
        const editor = dock?.querySelector('[data-slot="composer-surface"]')
        if (!dock || !editor) continue
        seen.add(root)
        let state = states.get(root)
        if (state && (state.dock !== dock || state.editor !== editor)) {
          detach(state, observer)
          state = null
        }
        if (!state) {
          state = { root, dock, editor }
          states.set(root, state)
          owners.set(dock, state)
          owners.set(editor, state)
          observer.observe(dock, { box: 'border-box' })
          observer.observe(editor, { box: 'border-box' })
        }
        measure(state)
      }
      for (const [root, state] of states) if (!seen.has(root)) detach(state, observer)
    },
    resize(entries) {
      const dirty = new Set(entries.map(({ target }) => owners.get(target)).filter(Boolean))
      for (const state of dirty) measure(state)
    },
    dispose(observer) {
      for (const state of states.values()) detach(state, observer)
    },
  }
}
