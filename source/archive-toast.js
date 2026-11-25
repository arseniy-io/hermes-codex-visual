import { host } from '@hermes/plugin-sdk'
import { codexMask, codexReference } from './codex-reference.js'
import { mountCSS } from './style-scope.js'
import { committedFiber } from './sidebar-recents.js'
import { sessionOwnerKey, sessionRowOwner } from './session-rename.js'
import { createArchiveOperation, restoreArchivedChat } from './archive-operation.js'
import { registerSidebarArchiveAction } from './sidebar-archive-action.js'

// Private native exports for the currently verified Desktop build. A changed
// build fails closed and keeps Hermes's own archive action available.
const nativeAssets = [
  ['session-states-BI6if4sf.js', '6626ee8b092249b4293d69c020c99530e294ae0f0f3a7badcc46a37ac9188f40'],
  ['session-IWmkdxMq.js', 'aa0c1714956f5212d02e86ebdd0c936dab447f388059dd70d9c6dd0e2310da86'],
  ['connections-gJYeTOKX.js', 'c4174e985d70e144e192b25280fbf53bac6209210b5454e5ff0064e0bdd067a6'],
  ['actions-B3WdBjcR.js', '71e56ad8dfd8acd060ae662a314735ddeb99fffe81ca7c45f49e8c81846cf6ee'],
  ['notifications-DpIDHbml.js', '63b27533e7fbf4aabcb4338b0afba4ce35c29596f8d7fd79135e2956e8a75964'],
]

async function nativeBridge() {
  const urls = nativeAssets.map(([file]) => new URL(`./assets/${file}`, document.baseURI).href)
  if (!crypto.subtle) return null
  try {
    const verified = await Promise.all(urls.map(async (url, index) => {
      const response = await fetch(url)
      if (!response.ok) return false
      const bytes = await response.arrayBuffer()
      const hash = await crypto.subtle.digest('SHA-256', bytes)
      const actual = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('')
      return actual === nativeAssets[index][1]
    }))
    if (!verified.every(Boolean)) return null
    const [tiles, sessions, connections, actions, notices] = await Promise.all(urls.map(url => import(/* @vite-ignore */ url)))
    if (typeof tiles.lt !== 'function' || typeof sessions.Ni !== 'function' ||
        typeof connections.yr !== 'function' || typeof actions.Gt !== 'function' ||
        typeof notices.t?.get !== 'function' || typeof notices.i !== 'function') return null
    return { delegate: tiles.lt, untombstone: sessions.Ni, restoreRow: connections.yr,
      rows: sessions.H, mutate: actions.Gt, notifications: notices.t, dismissNotice: notices.i }
  } catch { return null }
}

const rowSelector = '[data-tour="sessions-sidebar"] .row-hover'
const rowButton = 'button[data-slot="row-button"]:has(.hover-marquee)'
function nativeRow(button) {
  for (let node = committedFiber(button); node; node = node.return) {
    const props = node.memoizedProps
    if (typeof props?.session?.id === 'string' && typeof props.onArchive === 'function' &&
        typeof props.isPinned === 'boolean') return props
  }
  return null
}
const readRow = row => nativeRow(row?.querySelector(rowButton))

function pinPosition(button, id) {
  for (let node = committedFiber(button); node; node = node.return) {
    const props = node.memoizedProps
    if (props?.pinned === true && Array.isArray(props.sessions)) {
      const found = props.sessions.findIndex(session => session.id === id)
      return found < 0 ? undefined : found
    }
  }
  return undefined
}
const copy = {
  ru: { pending: 'Архивация чата…', archived: 'Чат архивирован', restored: 'Чат восстановлен', undo: 'Отменить',
    view: 'Просмотр', close: 'Закрыть', error: 'Не удалось восстановить чат',
    archiveError: 'Не удалось подтвердить архивирование чата', notifications: 'Уведомления' },
  en: { pending: 'Archiving chat…', archived: 'Archived chat', restored: 'Chat restored', undo: 'Undo',
    view: 'View', close: 'Close', error: 'Failed to unarchive conversation',
    archiveError: 'Could not confirm chat was archived', notifications: 'Notifications' },
}

export function registerArchiveToast(ctx, active) {
  const root = document.documentElement
  const enabled = () => root.matches(active)
  const words = () => /^ru(?:-|$)/i.test(root.lang) ? copy.ru : copy.en
  const loading = nativeBridge()
  const container = document.createElement('div')
  container.dataset.hcvArchiveToasts = ''
  container.dataset.hcvArchiveBridge = 'loading'
  container.hidden = !enabled()
  container.setAttribute('role', 'region')
  container.setAttribute('aria-label', words().notifications)
  document.body.append(container)
  let disposed = false
  let menuTrigger = null
  let contextRow = null
  const timers = new Set()
  const channel = new BroadcastChannel('hermes:sessions')
  let pendingCount = 0
  const operations = new Set()
  const timerControls = new Set()
  let unsubscribe = null
  let previousNoticeIds = new Set()

  loading.then(bridge => {
    if (disposed) return
    container.dataset.hcvArchiveBridge = bridge ? 'ready' : 'unavailable'
    if (!bridge) return
    previousNoticeIds = new Set(bridge.notifications.get().map(n => n.id))
    unsubscribe = bridge.notifications.listen(items => {
      const fresh = items.filter(n => !previousNoticeIds.has(n.id))
      previousNoticeIds = new Set(items.map(n => n.id))
      if (!pendingCount) return
      for (const item of fresh) {
        if (item.kind === 'success' && ['В архиве', 'Archived'].includes(item.message)) {
          queueMicrotask(() => bridge.dismissNotice(item.id))
        }
      }
    })
  })

  mountCSS(ctx, 'data-hcv-archive-toast-css', `
${active} [data-hcv-archive-toasts] { position:fixed; z-index:999999; inset:48px 8px auto; display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; }
${active} [data-hcv-archive-toasts][hidden] { display:none; }
${active} [data-hcv-archive-toast] { pointer-events:auto; touch-action:none; box-sizing:border-box; max-width:100%; display:flex; align-items:flex-start; gap:4px; padding:8px 12px; border:1px solid light-dark(rgb(26 28 31 / .08), rgb(255 255 255 / .08)); border-radius:12px; color:light-dark(#1a1c1f,#dfdfdf); background:light-dark(#fff,#292929); box-shadow:0 4px 12px #0000001a; font:430 14px/1.4 ${codexReference.font}; opacity:0; transform:translateY(-100%); transition:transform .3s ease,opacity .3s ease,height .3s ease; }
${active} [data-hcv-archive-toast][data-open] { opacity:1; transform:translateY(0); }
${active} [data-hcv-archive-toast][data-success] { color:light-dark(#00692a,#04b84c); border-color:color-mix(in srgb,currentColor 20%,transparent); background:linear-gradient(light-dark(rgb(4 184 76 / .08),rgb(4 184 76 / .15)) 0 0), light-dark(#fff,#181818); }
${active} [data-hcv-archive-icon] { inline-size:24px; block-size:24px; flex:none; display:flex; align-items:center; justify-content:center; }
${active} [data-hcv-archive-icon]::before { content:''; display:block; inline-size:16px; block-size:16px; background:currentColor; mask:var(--hcv-archive-icon) center/contain no-repeat; }
${active} [data-hcv-archive-icon][data-pending]::before { animation:hcv-archive-spin 1s linear infinite; }
${active} [data-hcv-archive-main] { display:flex; min-inline-size:0; flex:1; align-items:flex-start; gap:12px; }
${active} [data-hcv-archive-label] { min-block-size:24px; display:flex; align-items:center; font-weight:500; white-space:pre-wrap; overflow-wrap:anywhere; }
${active} [data-hcv-archive-actions] { display:flex; flex:none; align-items:center; gap:8px; }
${active} [data-hcv-archive-toast] [hidden] { display:none !important; }
${active} [data-hcv-archive-toast] button { appearance:none; cursor:pointer; border:1px solid transparent; font:430 12px/16px ${codexReference.font}; display:inline-flex; flex:none; align-items:center; justify-content:center; block-size:24px; padding:0 8px; border-radius:999px; transition:background-color .15s ease,color .15s ease; }
${active} [data-hcv-archive-view] { color:inherit; background:color-mix(in srgb,currentColor 5%,transparent); }
${active} [data-hcv-archive-view]:hover { background:color-mix(in srgb,currentColor 10%,transparent); }
${active} [data-hcv-archive-undo] { color:light-dark(#fff,#181818); background:light-dark(#1a1c1f,#dfdfdf); }
${active} [data-hcv-archive-undo]:hover { background:light-dark(#424447,#c8c8c8); }
${active} [data-hcv-archive-toast] button:focus-visible { outline:2px solid #339cff; outline-offset:2px; }
${active} [data-hcv-archive-toast] [data-hcv-archive-close] { padding:0; inline-size:24px; color:inherit; background:transparent; }
${active} [data-hcv-archive-close]:hover { background:color-mix(in srgb,currentColor 5%,transparent); }
${active} [data-hcv-archive-close]::before { content:''; inline-size:16px; block-size:16px; background:currentColor; mask:${codexMask('archiveToastClose')} center/contain no-repeat; }
@keyframes hcv-archive-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { ${active} [data-hcv-archive-toast], ${active} [data-hcv-archive-toast] button { transition:none; } ${active} [data-hcv-archive-icon]::before { animation:none; } }
`)

  function toast() {
    const node = document.createElement('div')
    node.dataset.hcvArchiveToast = ''
    node.setAttribute('role', 'status')
    const icon = document.createElement('span'); icon.dataset.hcvArchiveIcon = ''
    const main = document.createElement('div'); main.dataset.hcvArchiveMain = ''
    const label = document.createElement('div'); label.dataset.hcvArchiveLabel = ''
    const actions = document.createElement('div'); actions.dataset.hcvArchiveActions = ''
    const view = document.createElement('button'); view.type = 'button'; view.dataset.hcvArchiveView = ''
    const undo = document.createElement('button'); undo.type = 'button'; undo.dataset.hcvArchiveUndo = ''
    const close = document.createElement('button'); close.type = 'button'; close.dataset.hcvArchiveClose = ''
    main.append(label, actions); actions.append(view, undo); node.append(icon, main, close); container.prepend(node)
    let timer = null, remaining = 5000, started = 0, dismissed = false, expirable = false
    const stop = () => { if (timer !== null) { clearTimeout(timer); timers.delete(timer); timer = null; remaining -= performance.now() - started } }
    const start = () => {
      if (!expirable || dismissed || timer !== null || container.hidden || document.hidden || !document.hasFocus()) return
      started = performance.now(); timer = setTimeout(dismiss, Math.max(0, remaining)); timers.add(timer)
    }
    function dismiss() {
      if (dismissed) return
      dismissed = true; stop(); delete node.dataset.open
      timerControls.delete(control)
      const id = setTimeout(() => { timers.delete(id); node.remove() }, 300); timers.add(id)
    }
    const control = { start, stop }
    timerControls.add(control)
    node.addEventListener('pointerenter', stop); node.addEventListener('pointerleave', start)
    let drag = null
    node.addEventListener('pointerdown', event => {
      if (event.button === 2 || event.target.closest('button')) return
      drag = { x:event.clientX, y:event.clientY, started:performance.now(), axis:null, moved:0 }
      node.setPointerCapture(event.pointerId)
      stop()
    })
    node.addEventListener('pointermove', event => {
      if (!drag || window.getSelection()?.toString()) return
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y
      if (!drag.axis && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (drag.axis !== 'x') return
      drag.moved = dx >= 0 ? dx : dx / (1.5 + Math.abs(dx) / 20)
      node.style.transition = 'none'
      node.style.transform = `translateX(${drag.moved}px)`
    })
    const finishDrag = () => {
      if (!drag) return
      const { moved, started, axis } = drag
      drag = null
      node.style.removeProperty('transition')
      if (axis === 'x' && (Math.abs(moved) >= 45 || Math.abs(moved) / Math.max(1, performance.now() - started) > .11)) {
        dismissed = true; stop(); timerControls.delete(control)
        node.style.transition = 'transform .2s ease-out, opacity .2s ease-out'
        node.style.transform = `translateX(${moved < 0 ? '-100%' : '100%'})`
        node.style.opacity = '0'
        const id = setTimeout(() => { timers.delete(id); node.remove() }, 200); timers.add(id)
      } else { node.style.removeProperty('transform'); start() }
    }
    node.addEventListener('pointerup', finishDrag)
    node.addEventListener('pointercancel', finishDrag)
    close.addEventListener('click', dismiss)
    view.addEventListener('click', () => { dismiss(); host.navigate('/settings?tab=sessions') })
    requestAnimationFrame(() => { if (!dismissed) node.dataset.open = '' })
    return { node, undo, dismiss, success() {
      const text = words()
      close.setAttribute('aria-label', text.close)
      node.dataset.success = ''
      label.textContent = text.restored
      actions.hidden = true
      icon.style.setProperty('--hcv-archive-icon', codexMask('archiveToastRestored'))
      expirable = true; start()
    }, update(phase, undoRequested) {
      const text = words(); close.setAttribute('aria-label', text.close); undo.textContent = text.undo; view.textContent = text.view
      const pending = phase === 'pending' || phase === 'restoring'
      label.textContent = pending ? text.pending : text.archived
      icon.style.setProperty('--hcv-archive-icon', pending ? codexMask('archiveToastPending') : codexMask('archiveToast'))
      icon.toggleAttribute('data-pending', pending)
      view.hidden = pending
      undo.disabled = Boolean(undoRequested)
      if (phase === 'archived') { expirable = true; remaining = 5000; start() }
      if (phase === 'restoring') { expirable = false; stop() }
      if (phase === 'archive-error' || phase === 'restore-error' || phase === 'restored') dismiss()
    } }
  }

  function refreshRestoredChat(owner, sessionId, rows) {
    if (disposed) return
    channel.postMessage(1)
    if (typeof rows?.get !== 'function') return
    // Hermes caches sidebar snapshots for five seconds. A refresh issued
    // right after Undo can still return the slice from before the restore.
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (host.state.connectionId.get() !== owner.connectionId) return
      const profile = host.state.profile.get()
      if (profile && profile !== 'all' && profile !== owner.profile) return
      const visible = rows.get().some(row => row.id === sessionId && !row.archived &&
        sessionRowOwner(row, owner.connectionId)?.profile === owner.profile)
      if (!visible) channel.postMessage(1)
    }, 5000)
    timers.add(timer)
  }

  async function runArchive(row, props, owner, key) {
    const session = props.session
    const bridge = await loading
    if (host.state.connectionId.get() !== owner.connectionId) {
      host.notify({ kind:'error', message:words().error })
      operations.delete(key)
      return
    }
    if (!bridge || !enabled() || disposed) {
      try { props.onArchive() } finally { operations.delete(key) }
      return
    }
    const delegate = bridge.delegate()
    if (typeof delegate?.archiveSession !== 'function') {
      try { props.onArchive() } finally { operations.delete(key) }
      return
    }
    const index = props.isPinned ? pinPosition(row.querySelector(rowButton), session.id) : undefined
    const card = toast()
    pendingCount++
    let op
    let reported = false
    const reportRestoreError = () => { if (!reported) { reported = true; host.notify({ kind:'error', message:words().error }) } }
    try {
      op = createArchiveOperation({
        archive: () => delegate.archiveSession(session.id),
        isArchived: async () => {
          const query = new URLSearchParams({ profile: owner.profile })
          const result = await window.hermesDesktop.api({ ...owner, path: `/api/sessions/${encodeURIComponent(session.id)}?${query}` })
          return result?.archived === true || result?.archived === 1 || result?.session?.archived === true || result?.session?.archived === 1
        },
        restore: () => restoreArchivedChat({ session, owner, pinned: props.isPinned, index,
          mutate: bridge.mutate, api: options => window.hermesDesktop.api(options),
          currentConnection: () => host.state.connectionId.get(), untombstone: bridge.untombstone,
          restoreRow: bridge.restoreRow, pin: host.sessions.pin,
          broadcast: () => refreshRestoredChat(owner, session.id, bridge.rows) }),
        changed: ({ phase, wantsUndo }) => {
          card.update(phase, wantsUndo)
          if (phase === 'restored' && !disposed && enabled()) toast().success()
        },
      })
      card.undo.addEventListener('click', () => { void op.undo().catch(reportRestoreError) })
      await op.result
    } catch (error) {
      if (op?.phase === 'restore-error') reportRestoreError()
      if (op?.phase === 'archive-error' && !bridge.notifications.get().some(item => item.kind === 'error')) {
        host.notify({ kind:'error', message:words().archiveError })
      }
    } finally { pendingCount--; operations.delete(key) }
  }

  function startArchive(row, props, owner) {
    const key = sessionOwnerKey(owner, props.session.id)
    if (operations.has(key)) return
    operations.add(key)
    void runArchive(row, props, owner, key)
  }

  registerSidebarArchiveAction(ctx, active, rowSelector, readRow, row => {
    if (!enabled() || disposed) return
    const props = readRow(row)
    if (!props || props.session.archived) return
    const connectionId = host.state.connectionId.get()
    const owner = sessionRowOwner(props.session, connectionId)
    // Rows outside the active connection keep their Hermes-owned callback.
    if (!owner || owner.connectionId !== connectionId) {
      props.onArchive()
      return
    }
    startArchive(row, props, owner)
  })

  function rememberMenu(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement
    const trigger = target?.closest('button[aria-haspopup="menu"]')
    const row = trigger?.closest(rowSelector)
    if (row && trigger !== row.querySelector(rowButton)) menuTrigger = trigger
  }
  ctx.addEventListener(document, 'focusin', rememberMenu, true)
  ctx.addEventListener(document, 'pointerdown', rememberMenu, true)
  ctx.addEventListener(document, 'contextmenu', event => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement
    contextRow = target?.closest(rowSelector) || null
    menuTrigger = null
  }, true)
  ctx.addEventListener(document, 'click', event => {
    if (!enabled() || disposed) return
    const target = event.target instanceof Element ? event.target : event.target?.parentElement
    const item = target?.closest('[role="menuitem"]'); const menu = item?.closest('[role="menu"]')
    if (!item || !['В архив', 'Archive'].includes(item.textContent.trim())) return
    const dropdown = menuTrigger?.isConnected && menuTrigger.getAttribute('data-state') === 'open' &&
      menu?.id && menu.id === menuTrigger.getAttribute('aria-controls')
    const context = contextRow?.isConnected && contextRow.getAttribute('data-state') === 'open' &&
      menu?.matches('[data-slot="context-menu-content"]') &&
      menu.getAttribute('aria-label') === contextRow.querySelector('button[data-session-actions]')?.getAttribute('aria-label')
    const row = dropdown ? menuTrigger.closest(rowSelector) : context ? contextRow : null
    const props = readRow(row)
    if (!props || props.session.archived) return
    const connectionId = host.state.connectionId.get()
    const owner = sessionRowOwner(props.session, connectionId)
    if (!owner || owner.connectionId !== connectionId) return
    event.preventDefault(); event.stopImmediatePropagation()
    menu.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }))
    startArchive(row, props, owner)
  }, true)
  ctx.addEventListener(window, 'focus', () => { for (const control of timerControls) control.start() })
  ctx.addEventListener(window, 'blur', () => { for (const control of timerControls) control.stop() })
  ctx.addEventListener(document, 'visibilitychange', () => {
    for (const control of timerControls) document.hidden ? control.stop() : control.start()
  })
  const themeObserver = new MutationObserver(() => {
    container.hidden = !enabled()
    for (const control of timerControls) container.hidden ? control.stop() : control.start()
  })
  themeObserver.observe(root, { attributes:true, attributeFilter:['data-hermes-codex-visual', 'data-hermes-theme'] })
  ctx.onDispose(() => {
    disposed = true; themeObserver.disconnect(); unsubscribe?.(); channel.close(); container.remove()
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
  })
}
