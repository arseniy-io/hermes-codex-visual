import { createElement as h, useCallback, useState, useSyncExternalStore } from 'react'
import { COMPOSER_AREAS, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, host } from '@hermes/plugin-sdk'
import { codexIconStyle } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'

const nativeSelector = '[data-slot="statusbar"]'

function nativeItem(footer) {
  for (let fiber = committedFiber(footer); fiber; fiber = fiber.return) {
    const items = fiber.memoizedProps?.items
    if (!Array.isArray(items)) continue
    return items.find(item => item.id === 'approval-mode' && !item.hidden && item.menuContent)
  }
}

function nativeButton(footer) {
  for (const button of footer.querySelectorAll('button[aria-haspopup="menu"]')) {
    for (let fiber = committedFiber(button); fiber && fiber.stateNode !== footer; fiber = fiber.return) {
      if (fiber.memoizedProps?.item?.id === 'approval-mode') return button
    }
  }
}

function ApprovalControl({ subscribe, snapshot }) {
  const [main, setMain] = useState(false)
  const locate = useCallback(node => {
    setMain(Boolean(node?.closest('form[data-slot="composer-root"][data-tour="composer"]:not([data-popped-out])') &&
      !node.closest('[data-hud-shell]')))
  }, [])
  const { item, route } = useSyncExternalStore(subscribe, snapshot)
  let control
  if (main && item) {
    const off = Boolean(item.className)
    control = h(DropdownMenu, { key: route },
      h(DropdownMenuTrigger, { asChild: true },
        h('button', {
          type: 'button', 'data-hcv-approval': off ? 'off' : '', 'aria-label': item.title, title: item.title,
          disabled: item.disabled,
        },
        h('span', { 'data-hcv-approval-icon': '', 'aria-hidden': 'true', style: codexIconStyle(off ? 'shieldWarning' : 'shield') }),
        h('span', { 'data-hcv-approval-label': '' }, item.label))),
      h(DropdownMenuContent, {
        side: 'top', align: 'start', sideOffset: 4, 'data-hcv-approval-menu': '', 'aria-label': item.toggleLabel,
      }, item.menuContent))
  }
  return h('span', { ref: locate, 'data-hcv-approval-anchor': '' }, control)
}

export function registerComposerApproval(ctx, active) {
  const root = document.documentElement
  const contrast = matchMedia('(forced-colors: none)')
  const listeners = new Set()
  let current = {}
  let source
  let registration
  let frame
  const snapshot = () => current
  const subscribe = listener => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const markSource = button => {
    if (source === button) return
    source?.removeAttribute('data-hcv-approval-source')
    source = button
    source?.setAttribute('data-hcv-approval-source', '')
  }
  function sync() {
    frame = 0
    const enabled = contrast.matches && root.matches(active)
    if (enabled) {
      registration ??= ctx.register({
        id: 'composer-approval', area: COMPOSER_AREAS.leading, render: () => h(ApprovalControl, { subscribe, snapshot }),
      })
    } else {
      registration?.()
      registration = undefined
    }
    const footer = enabled && document.querySelector(nativeSelector)
    const item = footer ? nativeItem(footer) : undefined
    const route = JSON.stringify([host.state.connectionId.get(), host.state.profile.get()])
    markSource(item && footer ? nativeButton(footer) : undefined)
    if (item !== current.item || route !== current.route) {
      current = { item, route }
      for (const listener of listeners) listener()
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync) }
  const observer = new MutationObserver(schedule)
  observer.observe(root, { childList: true, characterData: true, subtree: true,
    attributes: true, attributeFilter: ['data-hermes-theme', 'lang'] })
  contrast.addEventListener('change', schedule)
  const unsubscribe = [host.state.gateway, host.state.connectionId, host.state.profile].map(atom => atom.listen(schedule))
  ctx.onDispose(() => {
    observer.disconnect()
    cancelAnimationFrame(frame)
    registration?.()
    markSource(undefined)
    contrast.removeEventListener('change', schedule)
    for (const off of unsubscribe) off()
  })
  sync()
}
