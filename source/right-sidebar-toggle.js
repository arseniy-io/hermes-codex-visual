import { createElement as h, useEffect, useLayoutEffect, useState } from 'react'
import { TITLEBAR_AREAS, useI18n, useTheme } from '@hermes/plugin-sdk'
import { committedFiber } from './sidebar-recents.js'
import { mountStyle } from './style-scope.js'
import { correctedRightLabel, discoverRightBridge, readRightBridge, relevantRightMutation, subscribeRightBridge } from './right-sidebar-state.js'

function nativeButton(element) {
  const candidates = []
  let tooltip = false
  const domLabel = element.getAttribute('aria-label')
  for (let fiber = committedFiber(element); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    // The actual Tip wraps TipKeybindLabel with this action and text. Require
    // the live tooltip in the fiber chain, not just an actionId on the tool.
    if (props?.placement === 'toolbar' && props.label?.props?.actionId === 'view.toggleRightSidebar' &&
        props.label?.props?.text === domLabel) tooltip = true
    if (typeof fiber.type === 'function' && props?.tool?.id === 'right-sidebar' &&
        typeof props.tool.onSelect === 'function' && typeof props.navigate === 'function' &&
        props.tool.actionId === 'view.toggleRightSidebar' && props.tool.label === domLabel)
      candidates.push({ type: fiber.type, props })
  }
  return tooltip && candidates.length === 1 ? candidates[0] : null
}

const sameBridge = (a, b) => !!a && !!b && a.tree === b.tree && a.hidden === b.hidden &&
  a.narrow === b.narrow && a.collapsed === b.collapsed && a.panes === b.panes

function RightSidebarMirror({ themeName }) {
  const theme = useTheme()
  const { t } = useI18n()
  const [data, setData] = useState(null)

  // Hide the original only AFTER the exact native component is mounted in the
  // portal. If any input disappears, effect cleanup restores the native one.
  useLayoutEffect(() => {
    if (theme.themeName !== themeName || !data?.original?.isConnected || !data.target?.isConnected) return
    const cloned = data.target.querySelector('[data-tour="right-pane-toggle"]')
    const native = cloned && nativeButton(cloned)
    if (!native || native.type !== data.type || native.props.tool.label !== data.label) {
      data.target.style.display = 'none'
      data.original.removeAttribute('data-hcv-right-original')
      queueMicrotask(data.rejectMirror)
      return
    }
    data.target.style.display = 'contents'
    data.target.toggleAttribute('data-hcv-right-open', data.open === true)
    data.original.setAttribute('data-hcv-right-original', '')
  }, [data?.original, data?.target, data?.type, data?.props, data?.label, data?.open, theme.themeName, themeName])

  // React removes a portal during the commit, before passive effect cleanup.
  // Restore keyboard focus in layout cleanup, while the clone is still mounted.
  // Label updates are deliberately excluded so a normal toggle keeps focus.
  useLayoutEffect(() => {
    if (theme.themeName !== themeName || !data?.original || !data.target) return
    const { original, target } = data
    return () => {
      const focused = target.contains(document.activeElement)
      original.removeAttribute('data-hcv-right-original')
      if (focused && original.isConnected) original.focus({ preventScroll: true })
    }
  }, [data?.original, data?.target, theme.themeName, themeName])

  useEffect(() => {
    if (theme.themeName !== themeName) { setData(null); return }
    let live = true, frame = 0, bridge = null, unsubscribe = null, original = null, target = null, blocked = null
    const queue = () => { if (live && !frame) frame = requestAnimationFrame(sync) }
    function unbind() { unsubscribe?.(); unsubscribe = null; bridge = null }
    function removeMirror() {
      if (!original && !target) return
      const focused = target?.contains(document.activeElement)
      original?.removeAttribute('data-hcv-right-original')
      if (focused && original?.isConnected) original.focus({ preventScroll: true })
      target?.remove()
      original = null
      target = null
      if (live) setData(previous => previous === null ? previous : null)
    }
    function sync() {
      frame = 0
      if (!live) return
      const originals = [...document.querySelectorAll('[data-titlebar-cluster="right"] [data-tour="right-pane-toggle"]')]
        .filter(button => !button.closest('[data-hcv-right-mirror]'))
      const button = originals.length === 1 ? originals[0] : null
      const native = button && nativeButton(button)
      let next = null
      try { next = discoverRightBridge(document, committedFiber) } catch {}
      if (!sameBridge(bridge, next)) {
        unbind()
        if (next) {
          const stop = subscribeRightBridge(next, queue)
          if (stop) { bridge = next; unsubscribe = stop }
        }
      }
      const open = bridge ? readRightBridge(bridge) : null
      const label = native ? correctedRightLabel(native.props.tool.label, t?.titlebar, open) : null
      if (!button || !native || label === null ||
          (native.props.tool.title && native.props.tool.title !== native.props.tool.label) ||
          (blocked?.button === button && blocked.props === native.props)) {
        removeMirror()
        return
      }
      if (blocked && (blocked.button !== button || blocked.props !== native.props)) blocked = null
      if (original !== button || !target?.isConnected) {
        removeMirror()
        original = button
        target = document.createElement('span')
        target.dataset.hcvRightMirror = ''
        target.style.display = 'none'
        button.before(target)
      }
      const expectedTarget = target
      const rejectMirror = () => {
        if (!live || original !== button || target !== expectedTarget) return
        blocked = { button, props: native.props }
        removeMirror()
      }
      const candidate = { original, target, type: native.type, props: native.props, label, open, rejectMirror }
      setData(previous => previous?.original === original && previous?.target === target &&
        previous?.type === native.type && previous?.props === native.props &&
        previous?.label === label && previous?.open === open ? previous : candidate)
    }
    const mutations = new MutationObserver(records => {
      if (records.some(record => relevantRightMutation(record, original))) queue()
    })
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true,
      attributeFilter: ['hidden', 'inert', 'data-pane-hidden', 'data-tree-split', 'data-titlebar-cluster',
        'data-tour', 'aria-label', 'aria-pressed', 'aria-expanded', 'disabled', 'title'] })
    window.addEventListener('resize', queue)
    queue()
    return () => {
      live = false
      if (frame) cancelAnimationFrame(frame)
      mutations.disconnect()
      window.removeEventListener('resize', queue)
      unbind()
      removeMirror()
    }
  }, [theme.themeName, themeName, t])

  // Keep the portal through this commit when the theme changes. The layout
  // cleanup can then return focus before the passive disposer removes it.
  if (!data) return null
  const tool = { ...data.props.tool, label: data.label }
  if (tool.title === data.props.tool.label) tool.title = data.label
  if (tool.expanded !== undefined) tool.expanded = data.open
  const component = h(data.type, { ...data.props, tool })
  // React 19 portal record, as in NativeRecentRows. Reuses Hermes's own
  // TitlebarToolButton, Tooltip, action, icon, key hint and native theme.
  return { $$typeof: Symbol.for('react.portal'), key: null, children: component, containerInfo: data.target, implementation: null }
}

export function registerRightSidebarMirror(ctx, themeName) {
  const scope = `:root[data-hermes-codex-visual][data-hermes-theme="${CSS.escape(themeName)}"]`
  const sheet = document.createElement('style')
  sheet.dataset.hcvRightSidebarMirror = ''
  sheet.textContent = `${scope} [data-hcv-right-original] { display: none !important; }`
  mountStyle(ctx, sheet)
  ctx.register({ id: 'right-sidebar-mirror', area: TITLEBAR_AREAS.right,
    render: () => h(RightSidebarMirror, { themeName }) })
  ctx.onDispose(() => sheet.remove())
}
