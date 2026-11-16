import { movedElementMatches } from './dom-changes.js'

const scopes = new WeakMap()
const hiddenPane = '[data-pane-hidden], [hidden]'
const chatTab = '[data-zone-tabstrip="grp-main"] [role="tab"][data-tree-tab^="session-tile:"]'
const visibleChatTab = `${chatTab}:not(:is(${hiddenPane}) *)`

export const chatStyles = {
  surface: '[data-chat-surface], [data-slot="composer-surface"]',
  retainAcrossChatTabs: true,
}

export function registerStyleScope(ctx, theme) {
  const root = document.documentElement
  const entries = []
  let watched = ''
  let queued = false
  let disposed = false

  function update() {
    queued = false
    if (disposed) return
    const enabled = root.dataset.hermesTheme === theme
    const [route, query] = location.hash.slice(2).split('?', 2)
    const screen = route.split('/')[0]
    const tab = screen === 'settings' ? new URLSearchParams(query).get('tab') : null
    const surfaces = new Map()
    const pending = new Set()
    let hasChatTabs
    for (const { sheet, anchor, screens, tabs, surface, visibleSurface, retainAcrossChatTabs } of entries) {
      let visible = enabled && !screens && !surface
      if (enabled && screens?.includes(screen) && (!tabs || tabs.includes(tab))) visible = true
      if (enabled && surface && !visible) {
        pending.add(surface)
        // The main strip survives a pane swap. Keep already-needed chat CSS
        // attached through it so revealing a saved pane does not reparse CSS.
        if (retainAcrossChatTabs) {
          pending.add(chatTab)
          if (sheet.isConnected) visible = hasChatTabs ??= Boolean(document.querySelector(visibleChatTab))
        }
        if (!visible) {
          if (!surfaces.has(surface)) surfaces.set(surface, Boolean(document.querySelector(visibleSurface)))
          visible = surfaces.get(surface)
        }
      }
      if (visible && !sheet.isConnected) anchor.after(sheet)
      if (!visible && sheet.isConnected) sheet.remove()
    }
    const next = [...pending].join(', ')
    if (watched !== next) {
      watched = next
      bodyChanges.disconnect()
      if (watched) bodyChanges.observe(document.body, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-pane-hidden', 'aria-selected'],
      })
    }
  }

  function schedule() {
    if (queued || disposed) return
    queued = true
    queueMicrotask(update)
  }

  const bodyChanges = new MutationObserver(records => {
    if (watched && records.some(record => record.type === 'childList'
      ? movedElementMatches(record, watched)
      : (record.attributeName === 'aria-selected' && record.target.hasAttribute('data-tree-tab')) ||
        record.target.matches(watched) || record.target.querySelector(watched))) schedule()
  })
  const themeChanges = new MutationObserver(schedule)
  themeChanges.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  ctx.addEventListener(window, 'hashchange', schedule)
  ctx.addEventListener(window, 'popstate', schedule)
  if (window.navigation) ctx.addEventListener(window.navigation, 'currententrychange', schedule)
  scopes.set(ctx, (sheet, conditions) => {
    // Keep the cascade in registration order across theme changes and remounts.
    const anchor = document.createComment('Hermes Codex Visual style')
    document.head.append(anchor)
    const surface = conditions?.surface
    const visibleSurface = surface && `:is(${surface}):not(${hiddenPane}, :is(${hiddenPane}) *)`
    entries.push({ sheet, anchor, ...conditions, visibleSurface })
    schedule()
  })
  ctx.onDispose(() => {
    disposed = true
    scopes.delete(ctx)
    themeChanges.disconnect()
    bodyChanges.disconnect()
    for (const { sheet, anchor } of entries) {
      sheet.remove()
      anchor.remove()
    }
  })
}

export function mountStyle(ctx, sheet, conditions) {
  scopes.get(ctx)(sheet, conditions)
}

export function mountCSS(ctx, marker, text, conditions) {
  const sheet = document.createElement('style')
  sheet.setAttribute(marker, '')
  sheet.textContent = text
  mountStyle(ctx, sheet, conditions)
}
