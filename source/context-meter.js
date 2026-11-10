import { Tip, host, useValue } from '@hermes/plugin-sdk'
import { createElement as h, useCallback, useEffect, useState } from 'react'

function readContext(usage) {
  const used = usage?.context_used
  const max = usage?.context_max
  if (!Number.isFinite(used) || used < 0 || !Number.isFinite(max) || max <= 0) return null

  return { used: Math.min(used, max), max, estimated: usage.context_estimated === true }
}

const modelName = value => String(value ?? '').toLowerCase().split('/').at(-1)

function useContext(inMainComposer) {
  const session = useValue(host.state.focusedSessionId)
  const owner = useValue(host.state.focusedSessionOwner)
  const primary = useValue(host.state.activeSessionId)
  const profile = useValue(host.state.profile) || 'default'
  const connection = useValue(host.state.connectionId)
  const model = useValue(host.state.model)
  const busy = useValue(host.state.busy)
  const gateway = useValue(host.state.gateway)
  const usage = useValue(host.state.focusedUsage)
  const [snapshot, setSnapshot] = useState(null)

  // The SDK's RPC uses the active socket. Only ask it about a chat that
  // belongs to that socket, even when several workspaces are open.
  const sameGateway = !owner || (owner.profile === profile && (!connection || owner.connectionId === connection))
  const key = inMainComposer && session && session === primary && sameGateway
    ? JSON.stringify([owner?.connectionId ?? connection, profile, session, model])
    : null

  useEffect(() => {
    if (!key || busy || gateway !== 'open') return

    const socket = host.getGateway()
    if (!socket) return

    let request = 0
    const refresh = () => {
      const current = ++request
      void socket.request('session.context_breakdown', { session_id: session }).then(data => {
        if (current !== request || host.getGateway() !== socket) return
        if (model && data?.model && modelName(model) !== modelName(data.model)) return
        setSnapshot({ key, context: readContext(data), seenUsage: host.state.focusedUsage.get() })
      }).catch(() => {})
    }

    // The picker paints the model before the gateway applies the switch.
    // Read again after the gateway confirms the session's model.
    const unsubscribe = socket.onEvent(event => {
      if (event.type === 'session.info' && event.session_id === session && !event.payload?.running) refresh()
    })
    refresh()
    return () => {
      request++
      unsubscribe()
    }
  }, [key, session, model, busy, gateway])

  if (!key || gateway !== 'open' || snapshot?.key !== key || !snapshot.context) return null

  const context = snapshot.context
  const liveModelMatches = !model || !usage?.model || modelName(model) === modelName(usage.model)
  const live = usage !== snapshot.seenUsage && liveModelMatches ? readContext(usage) : null
  return live?.max === context.max ? live : context
}

const number = new Intl.NumberFormat('ru-RU')
const thousands = tokens => number.format(Math.round(tokens / 1000))

function ContextReadout({ context }) {
  const percent = context.used / context.max * 100
  const whole = Math.round(percent)
  const full = whole >= 50
  const detail = full ? `${whole}% заполнено` : `${whole}% использовано (осталось ${100 - whole}%)`
  const used = `${context.estimated ? '≈' : ''}${thousands(context.used)}`
  // Composer strings from the ru-RU resource in Codex Desktop 26.1103.4239.0.
  const label = h('div', { 'data-hcv-context-detail': '' },
    h('span', { 'data-muted': '' }, 'Контекстное окно:'),
    h('span', full ? { 'data-muted': '' } : null, detail),
    h('span', null, `Использовано ${used} к / ${thousands(context.max)} к токенов`),
  )

  // Codex Desktop 26.1103.4239.0, 189497.6182e00931.js, module Kc0j.
  const circle = { cx: 6, cy: 6, r: 5, stroke: 'currentColor', strokeWidth: 2, fill: 'none' }
  const ring = h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true },
    h('circle', { ...circle, opacity: 0.16 }),
    h('circle', {
      ...circle,
      'data-hcv-context-arc': '',
      opacity: Number(percent !== 0),
      strokeLinecap: 'round',
      pathLength: 100,
      strokeDasharray: 100,
      strokeDashoffset: 100 - percent,
      transform: 'rotate(-90 6 6)',
    }),
  )

  return h(Tip, { label, side: 'top', align: 'center', sideOffset: 4, 'data-hcv-context-tip': '' },
    h('span', {
      'data-hcv-context-meter': '',
      role: 'img',
      tabIndex: 0,
      'aria-label': `Использование контекста: ${whole}%`,
    }, ring),
  )
}

function ContextMeter() {
  // The SDK model belongs to the main composer. Other tiles may use another
  // model, so never render the main chat's numbers under a tile's model.
  const [inMainComposer, setInMainComposer] = useState(false)
  const locate = useCallback(node => {
    const composer = node?.closest('[data-slot="composer-surface"]')
    setInMainComposer(Boolean(composer?.querySelector('[data-tour="model-pill"]')))
  }, [])
  const context = useContext(inMainComposer)

  return h('span', { 'data-hcv-context-anchor': '', ref: locate },
    context ? h(ContextReadout, { context }) : null,
  )
}

export function registerContextMeter(ctx, active) {
  const root = document.documentElement
  const sheet = document.createElement('style')
  sheet.textContent = `
    ${active} [data-hcv-context-anchor] { display: contents; }
    ${active} [data-hcv-context-meter] {
      display: inline-grid;
      place-items: center;
      flex: none;
      inline-size: 24px;
      block-size: 24px;
      color: var(--hcv-muted);
      border-radius: 6px;
    }
    ${active} [data-hcv-context-meter]:focus-visible {
      outline: 2px solid var(--hcv-focus);
      outline-offset: -2px;
    }
    ${active} [data-hcv-context-arc] {
      transition: stroke-dashoffset 120ms ease-out, opacity 120ms ease-out;
    }
    ${active} [data-hcv-context-detail] {
      display: flex;
      flex-direction: column;
      gap: 2px;
      inline-size: min(152px, calc(100vw - 50px));
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    ${active} [data-hcv-context-detail] [data-muted] { opacity: .6; }
    ${active} [data-hcv-context-tip] span:has(> [data-slot="tooltip-arrow"]) { display: none; }
    @media (prefers-reduced-motion: reduce) {
      ${active} [data-hcv-context-arc] { transition: none; }
    }
  `
  document.head.append(sheet)

  let remove
  const update = () => {
    if (root.matches(active)) {
      remove ??= ctx.register({
        id: 'context-meter',
        area: 'composer.actions',
        order: 110,
        render: () => h(ContextMeter),
      })
    } else if (remove) {
      remove()
      remove = undefined
    }
  }
  const observer = new MutationObserver(update)
  observer.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  ctx.onDispose(() => {
    observer.disconnect()
    remove?.()
    sheet.remove()
  })
  update()
}
