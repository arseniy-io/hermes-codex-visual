const hiddenPane = '[hidden], [data-pane-hidden]'

// Exact geometry for each ordinary, docked chat surface. Hermes deliberately
// buckets its public composer metrics to 8px. Keep those native values intact;
// these private properties only control the Codex transcript's clearance.
export function createComposerClearanceMetrics(currentLayoutKey = () => null) {
  const states = new Map()
  const owners = new Map()
  const dockProperty = '--hcv-composer-dock-height'
  const editorProperty = '--hcv-composer-surface-height'
  const aboveEditorProperty = '--hcv-composer-above-surface'
  const fallbackDock = '--hcv-last-composer-dock-height'
  const fallbackEditor = '--hcv-last-composer-surface-height'
  let saved = null

  function clearFallback() {
    saved?.pane.style.removeProperty(fallbackDock)
    saved?.pane.style.removeProperty(fallbackEditor)
  }

  function restoreFallback(key) {
    if (!saved) return
    const { pane, width, dockHeight, editorHeight } = saved
    if (key === saved.key && pane.isConnected && pane.clientWidth === width) {
      write(pane, fallbackDock, dockHeight)
      write(pane, fallbackEditor, editorHeight)
    } else clearFallback()
  }

  function forgetPane(pane) {
    if (!saved || saved.pane !== pane) return
    clearFallback()
    saved = null
  }

  function clear(state) {
    state.root.style.removeProperty(dockProperty)
    state.root.style.removeProperty(editorProperty)
    state.root.style.removeProperty(aboveEditorProperty)
  }
  function detach(state, observer) {
    observer.unobserve(state.dock)
    observer.unobserve(state.editor)
    owners.delete(state.dock)
    owners.delete(state.editor)
    if (state.dock.hasAttribute('data-popped-out')) forgetPane(state.pane)
    clear(state)
    states.delete(state.root)
  }
  function write(root, property, height) {
    const value = `${height}px`
    if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value)
  }
  function measure(state) {
    const { root, dock, editor } = state
    if (dock.hasAttribute('data-popped-out')) forgetPane(state.pane)
    if (!root.isConnected || !dock.isConnected || !editor.isConnected || dock.hasAttribute('data-popped-out')) return clear(state)
    // Retain the last visible measurements when Hermes hides a mounted chat.
    // Clearing and rewriting the inherited values restyles the transcript.
    state.hidden = Boolean(root.closest(hiddenPane))
    if (state.hidden) return
    // getBoundingClientRect includes CSS zoom. Properties are lengths in the
    // owning surface's coordinate space, as is the 32px transcript gap.
    const zoom = Number(root.currentCSSZoom) || 1
    const dockBox = dock.getBoundingClientRect()
    const editorBox = editor.getBoundingClientRect()
    const dockHeight = dockBox.height / zoom
    const editorHeight = editorBox.height / zoom
    if (!(dockHeight > 0) || !(editorHeight > 0)) return clear(state)
    const key = state.pane && currentLayoutKey()
    const width = key && state.pane.clientWidth
    write(root, dockProperty, dockHeight)
    write(root, editorProperty, editorHeight)
    write(root, aboveEditorProperty, Math.max(0, (editorBox.top - dockBox.top) / zoom))
    if (key) {
      // The pane shell survives a route that removes the composer. Carry the
      // last measurements into the same chat's first native scroll restore.
      if (saved && saved.pane !== state.pane) clearFallback()
      saved = { pane: state.pane, key, width, dockHeight, editorHeight }
      write(state.pane, fallbackDock, dockHeight)
      write(state.pane, fallbackEditor, editorHeight)
    }
  }

  return {
    restoreFallback,
    sync(roots, observer, enabled = true) {
      if (saved && (!enabled || !saved.pane.isConnected)) forgetPane(saved.pane)
      const seen = new Set()
      for (const root of roots) {
        if (root.closest('[data-hud-shell]')) continue
        const dock = root.querySelector('[data-slot="composer-dock"]:not([data-popped-out])')
        const editor = dock?.querySelector('[data-slot="composer-surface"]')
        if (!dock || !editor) {
          if (root.querySelector('[data-slot="composer-dock"][data-popped-out]')) {
            forgetPane(states.get(root)?.pane)
          }
          continue
        }
        seen.add(root)
        let state = states.get(root)
        if (state && (state.dock !== dock || state.editor !== editor)) {
          detach(state, observer)
          state = null
        }
        if (!state) {
          // The retained native chat still owns its measured clearance on return.
          // Only older renderers need the pane-wide variables for a remount.
          const remountedMain = root.dataset?.composerTarget === 'main' && !root.closest('[data-workspace-chat-layer]')
          const pane = remountedMain ? root.closest('[data-tree-group="grp-main"]') : null
          state = { root, dock, editor, pane }
          states.set(root, state)
          owners.set(dock, state)
          owners.set(editor, state)
          observer.observe(dock, { box: 'border-box' })
          observer.observe(editor, { box: 'border-box' })
          measure(state)
        } else {
          // The resize observer owns measurement of an unchanged dock. Routine
          // transcript updates should not force layout just to read its size.
          const hidden = Boolean(root.closest(hiddenPane))
          if (state.hidden && !hidden) measure(state)
          state.hidden = hidden
        }
      }
      for (const [root, state] of states) if (!seen.has(root)) detach(state, observer)
    },
    resize(entries) {
      const dirty = new Set(entries.map(({ target }) => owners.get(target)).filter(Boolean))
      for (const state of dirty) measure(state)
    },
    dispose(observer) {
      for (const state of states.values()) detach(state, observer)
      if (saved) forgetPane(saved.pane)
    },
  }
}
