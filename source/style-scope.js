import { movedElementMatches } from './dom-changes.js'

const scopes = new WeakMap()
const hiddenPane = '[data-pane-hidden], [hidden]'
const chatTab = '[data-zone-tabstrip="grp-main"] [role="tab"][data-tree-tab^="session-tile:"]'
const visibleChatTab = `${chatTab}:not(:is(${hiddenPane}) *)`
const retainedWorkspaceChat = '[data-workspace-chat-layer] [data-chat-surface]'

export const chatStyles = {
  surface: '[data-chat-surface], [data-slot="composer-surface"]',
  retainAcrossChatTabs: true,
  retainParsed: true,
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
    let hasKeptChat
    for (const { sheet, anchor, screens, tabs, surface, visibleSurface, retainAcrossChatTabs, retainParsed, retainAfterFirstUse } of entries) {
      const mounted = sheet.isConnected
      const parsed = enabled && mounted && retainParsed ? sheet.sheet : null
      // Selectors bounded to their own surface can stay active after use.
      // Attaching or removing those sheets forces a document-wide style pass.
      const retained = retainAfterFirstUse && mounted
      let visible = enabled && (retained || !screens && !surface)
      if (enabled && screens?.includes(screen) && (!tabs || tabs.includes(tab))) visible = true
      if (enabled && surface && !visible) {
        pending.add(surface)
        // Keep already-needed chat CSS active while the native workspace owns
        // the parked transcript, including pages that hide the main tab strip.
        if (retainAcrossChatTabs) {
          pending.add(chatTab)
          pending.add(retainedWorkspaceChat)
          if (mounted && !parsed?.disabled) {
            hasKeptChat ??= Boolean(document.querySelector(`${visibleChatTab}, ${retainedWorkspaceChat}`))
            visible = hasKeptChat
          }
        }
        if (!visible) {
          if (!surfaces.has(surface)) surfaces.set(surface, Boolean(document.querySelector(visibleSurface)))
          visible = surfaces.get(surface)
        }
      }
      if (parsed) {
        // Park the shared chat styles in cascade order, without applying
        // their rules until a chat surface needs them again.
        if (parsed.disabled !== !visible) parsed.disabled = !visible
      } else if (visible && !mounted) {
        anchor.after(sheet)
      } else if (!visible && mounted) {
        sheet.remove()
      }
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
    if (watched && records.some(record => {
      if (record.type === 'childList') return movedElementMatches(record, watched)
      // Command pickers change aria-selected on pointer movement. Only pane
      // tabs use that state to decide which surface styles should be mounted.
      if (record.attributeName === 'aria-selected') return record.target.hasAttribute('data-tree-tab')
      return record.target.matches(watched) || record.target.querySelector(watched)
    })) schedule()
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
