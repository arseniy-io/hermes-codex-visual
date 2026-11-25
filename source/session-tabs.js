import { mountStyle } from './style-scope.js'
import { createElement as h, useRef, useState } from 'react'
import {
  atom, Button, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, host, Input, TITLEBAR_AREAS, useValue,
} from '@hermes/plugin-sdk'
import { codexIconRules } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'
import { composerForSurface, composerRichInput } from './composer-native.js'
import { applyTitleRead, createRenameFormController, createSessionRenamer, createUncertainRpcRegistry, MissingStoredSession, readTitleWithRetry, sessionOwnerKey, sessionRowOwner, sessionTabOwner, titleForOpen } from './session-rename.js'
import { fadingTitleStyles, trackTitleOverflow } from './title-overflow.js'

const tilePrefix = 'session-tile:'
const workspaceTab = '[role="tab"][data-tree-tab="workspace"]'
const chatTab = `${workspaceTab}, [role="tab"][data-tree-tab^="${tilePrefix}"]`
const sidebarChatRow = '[data-sessions-mode="projects"] [data-sessions-project] .row-hover'
const sidebarChatButton = 'button[data-slot="row-button"]:has(.hover-marquee)'
const labelSelector = '.pane-tab-content .truncate'
const mainChatTab = `[data-zone-tabstrip="grp-main"] :is(${chatTab}):has(> .pane-tab-content):not([data-vertical])`
const draftLabels = new Set(['New session', 'Untitled session', 'Новая сессия', 'Сеанс без названия'])
const copy = {
  ru: {
    fresh: 'Новый чат', title: 'Переименовать чат', hint: 'Кратко и узнаваемо',
    input: 'Название чата', placeholder: 'Добавить название…', cancel: 'Отмена',
    save: 'Сохранить', failed: 'Не удалось сохранить название. Попробуйте ещё раз.',
    review: 'Проверьте текущее название и сохраните ещё раз.',
    unverified: 'Не удалось проверить название чата. Попробуйте ещё раз.',
  },
  en: {
    fresh: 'New chat', title: 'Rename chat', hint: 'Keep it short and recognizable',
    input: 'Chat title', placeholder: 'Add a title…', cancel: 'Cancel',
    save: 'Save', failed: 'Couldn’t save the chat title. Try again.',
    review: 'Check the current title and save again.',
    unverified: 'Couldn’t check the chat title. Try again.',
  },
}

// The status dot receives the owning session row, including on a restored tab
// outside Recents. Use that to distinguish fallback text from a real title.
function tabSession(tab) {
  for (const dot of tab.querySelectorAll('.pane-tab-content span.rounded-full')) {
    for (let node = committedFiber(dot); node; node = node.return) {
      const props = node.memoizedProps
      if (props?.['data-tree-tab']) break
      if (props && 'storedSessionId' in props && 'session' in props) return props
    }
  }
  return null
}

function tabId(tab) {
  const pane = tab.dataset.treeTab
  if (pane.startsWith(tilePrefix)) return pane.slice(tilePrefix.length)
  const session = tabSession(tab)
  if (session) return session.storedSessionId || null
  for (let node = committedFiber(tab); node; node = node.return) {
    const props = node.memoizedProps
    if (props?.tabPaneId === 'workspace' && props.storedSessionId) return props.storedSessionId
  }
  return null
}

// The sidebar's row owns the real session and its profile. Read the committed
// row instead of inferring an ID from its visible, possibly truncated title.
function sidebarSession(button) {
  for (let node = committedFiber(button); node; node = node.return) {
    const props = node.memoizedProps
    if (typeof props?.session?.id === 'string' && typeof props.onResume === 'function') return props.session
  }
  return null
}

function sidebarOwner(session) {
  return sessionRowOwner(session, host.state.connectionId.get())
}

function draftSubmit(tab) {
  const group = tab.closest('[data-tree-group]')
  const surface = group?.querySelector('[data-chat-surface][data-composer-target="main"]')
  const input = surface && composerForSurface(surface)?.querySelector(composerRichInput)
  for (let node = committedFiber(input); node; node = node.return) {
    const props = node.memoizedProps
    if (typeof props?.onSubmit === 'function' && 'busy' in props && 'cwd' in props) return props.onSubmit
  }
  return null
}

// sidebarElectron.renameThreadDialog in Codex 26.1103.7773.0. The same
// compact form composition uses Hermes's Dialog primitives for focus/trapping.
function RenameForm({ target, close, save, recover, unsettled }) {
  const { words } = target
  const [value, setValue] = useState(target.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const input = useRef(null)
  const pending = useRef(false)
  const controller = useRef(null)
  if (!controller.current) controller.current = createRenameFormController(target.title, {
    save: (title, fence) => save(target, title, fence),
    recover: title => recover(target, title),
    unsettled: () => unsettled(target),
  })
  const title = value.trim()
  const submit = async (event) => {
    event.preventDefault()
    if (!title || pending.current) return
    pending.current = true
    setSaving(true)
    setError(false)
    try {
      const result = await controller.current.submit(title)
      if (result.review) {
        setValue(result.title)
        setError('review')
      } else close()
    } catch {
      setError('failed')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }
  return h(Dialog, { open: true, onOpenChange: (open) => { if (!open && !pending.current) close() } },
    h(DialogContent, {
      'data-hcv-rename-chat': '',
      bodyClassName: 'hcv-rename-body',
      blurBackdrop: false,
      overlayClassName: 'hcv-rename-overlay',
      showCloseButton: !saving,
      onOpenAutoFocus: (event) => {
        event.preventDefault()
        input.current?.focus()
        input.current?.select()
      },
      onCloseAutoFocus: (event) => {
        event.preventDefault()
        if (target.tab.isConnected) target.tab.focus({ preventScroll: true })
      },
    },
    h('form', { onSubmit: submit },
      h(DialogHeader, null, h(DialogTitle, null, words.title), h(DialogDescription, null, words.hint)),
      h(Input, {
        ref: input, 'aria-label': words.input, placeholder: words.placeholder, value,
        'aria-invalid': !title, disabled: saving, onChange: (event) => setValue(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
        },
      }),
      error && h('p', { role: 'alert', className: 'hcv-rename-error' }, words[error]),
      h(DialogFooter, null,
        h(Button, { type: 'button', variant: 'outline', disabled: saving, onClick: close }, words.cancel),
        h(Button, { type: 'submit', disabled: saving || !title }, words.save)))))
}

function RenameSlot({ model, close, save, recover, unsettled }) {
  const target = useValue(model)
  return target && h(RenameForm, { key: target.key, target, close, save, recover, unsettled })
}

function sessionTabStyles(active) {
  const dialog = `${active} [data-hcv-rename-chat]`
  const close = `${dialog} [data-slot="dialog-close-button"]`
  const tab = `${active} ${mainChatTab}`
  return `
  ${tab} { inline-size: 9rem; min-inline-size: 9rem; max-inline-size: 9rem; }

@media (forced-colors: none) {
  /* Keep the native draft label and its spacing, but do not paint its dot. */
  ${tab} .pane-tab-content span.rounded-full[class~="border-(--ui-text-quaternary)"]:not([role="status"]) { opacity: 0; }
  ${tab} .pane-tab-content span[aria-hidden="true"][class~="size-1"][class~="rounded-full"] { display: none; }
  ${tab} .pane-tab-content [role="status"]:is([class~="bg-(--ui-accent)"], [class~="border-(--ui-accent)"]) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  ${fadingTitleStyles(`${tab} ${labelSelector}`, '1rem')}
  ${active} .hcv-rename-overlay { background: #0002; backdrop-filter: none; }
  ${dialog} {
    inline-size: min(420px, calc(100vw - 32px));
    max-inline-size: none;
    border: 0;
    border-radius: 16px;
    background: var(--hcv-menu);
    color: light-dark(var(--hcv-text), #dfdfdf);
    font-family: var(--hcv-ui-font);
  }
  ${dialog} .hcv-rename-body { padding: 20px; }
  ${dialog} form { display: flex; flex-direction: column; gap: 12px; }
  ${dialog} [data-slot="dialog-header"] { gap: 4px; padding-inline-end: 24px; text-align: start; }
  ${dialog} [data-slot="dialog-title"] { font-size: 20px; font-weight: 600; line-height: 28px; }
  ${dialog} [data-slot="dialog-description"] { color: light-dark(var(--hcv-muted), rgb(255 255 255 / 49.8%)); font-size: 14px; line-height: 21px; }
  ${dialog} input[data-slot="input"] {
    block-size: 36px;
    padding: 0 10px;
    border: 1px solid light-dark(var(--hcv-hairline), rgb(255 255 255 / 15.6%));
    border-radius: 8px;
    background: transparent;
    color: inherit;
    box-shadow: none;
    font: 13px/18px var(--hcv-ui-font);
  }
  ${dialog} input[data-slot="input"]:focus {
    border-color: #339cffb3;
    outline: none;
    box-shadow: none;
  }
  ${dialog} input[data-slot="input"]::selection {
    background: light-dark(#c3ddf0, #42586a);
    color: var(--hcv-text);
  }
  ${dialog} [data-slot="dialog-footer"] { flex-flow: row wrap; justify-content: flex-end; gap: 12px; }
  ${dialog} [data-slot="dialog-footer"] button {
    min-block-size: 32px;
    block-size: auto;
    padding: 5px 16px;
    border-radius: 10px;
    font: 400 14px/20px var(--hcv-ui-font);
  }
  ${dialog} button[type="submit"] { background: light-dark(var(--hcv-action), #dfdfdf); color: var(--hcv-ink); }
  ${dialog} button[data-variant="outline"] {
    border: 1px solid light-dark(var(--hcv-hairline), rgb(255 255 255 / 8.4%));
    background: light-dark(color-mix(in srgb, var(--hcv-text) 4%, var(--hcv-menu)), rgb(255 255 255 / 3.2%));
    color: inherit;
  }
  ${close} { inset-block-start: 16px; inset-inline-end: 16px; inline-size: 24px; block-size: 24px; border-radius: 8px; }
  ${codexIconRules(`${close} > svg`, 'close')}
  ${dialog} .hcv-rename-error { margin: 0; color: var(--dt-destructive); font-size: 13px; }
  @supports (corner-shape: superellipse(1.5)) {
    ${dialog} { --hcv-popup-button-radius: 12.5px; border-radius: 20px; corner-shape: superellipse(1.5); }
    ${dialog} input[data-slot="input"] { border-radius: 10px; corner-shape: superellipse(1.5); }
    ${dialog} form [data-slot="dialog-footer"] button[data-slot="button"] { border-radius: 12.5px; corner-shape: superellipse(1.5); }
  }
}
`
}

export function registerSessionTabs(ctx, active) {
  const root = document.documentElement
  const model = atom(null)
  const translated = new Map()
  const named = new Map()
  const sidebarNamed = new Map()
  const renameSession = createSessionRenamer(options => window.hermesDesktop.api(options))
  const uncertainRpc = createUncertainRpcRegistry()
  const measureTitles = trackTitleOverflow()
  const sessions = new BroadcastChannel('hermes:sessions')
  let requestKey = 0
  let frame = 0
  let disposed = false
  let sidebarMenuTrigger = null
  let sidebarContextRow = null
  let openingSidebar = false
  const words = () => root.matches(':lang(ru)') ? copy.ru : copy.en
  const close = () => model.set(null)
  const enabled = () => !disposed && root.matches(active)
  const restore = (text, entry) => {
    if (text.data === entry.shown) text.data = entry.original
    if (entry.label.title === entry.shown) entry.label.title = entry.tooltip
    translated.delete(text)
  }
  const checkSidebarTitle = (owner, id, key, entry) => {
    if (entry.checking) { entry.recheck = true; return }
    entry.checking = true
    const version = entry.readVersion = (entry.readVersion || 0) + 1
    const query = new URLSearchParams({ profile: owner.profile })
    readTitleWithRetry(
      () => window.hermesDesktop.api({ ...owner, path: `/api/sessions/${encodeURIComponent(id)}?${query}` }),
      () => !disposed && sidebarNamed.get(key) === entry,
    )
      .then(result => {
        if (disposed || sidebarNamed.get(key) !== entry || entry.readVersion !== version) return
        const title = typeof result?.title === 'string' ? result.title.trim() : ''
        if (applyTitleRead(entry, version, title)) {
          const open = named.get(sessionOwnerKey(owner, id))
          if (open) open.title = title
          schedule()
        }
      }).catch(() => {
        if (sidebarNamed.get(key) === entry && entry.readVersion === version) entry.failed = true
      }).finally(() => {
        entry.checking = false
        if (entry.recheck && sidebarNamed.get(key) === entry) {
          entry.recheck = false
          checkSidebarTitle(owner, id, key, entry)
        }
      })
  }
  const labels = () => {
    frame = 0
    for (const [text, entry] of translated) {
      if (!enabled() || !text.isConnected || text.data !== entry.shown) restore(text, entry)
    }
    if (!enabled()) return measureTitles()
    const openIds = new Set()
    const mainLabels = []
    for (const tab of document.querySelectorAll(chatTab)) {
      const id = tabId(tab)
      const label = tab.querySelector(labelSelector)
      if (label && tab.matches(mainChatTab)) mainLabels.push(label)
      const text = label?.childNodes.length === 1 ? label.firstChild : null
      if (!(text instanceof Text)) continue
      const row = tabSession(tab)?.session
      let owner = row && sessionRowOwner(row, host.state.connectionId.get())
      if (!owner && id === host.state.focusedStoredSessionId.get()) {
        const focused = host.state.focusedSessionOwner.get()
        if (focused && named.get(sessionOwnerKey(focused, id))?.tab === tab) owner = focused
      }
      const key = owner && sessionOwnerKey(owner, id)
      if (key) openIds.add(key)
      const nativeTitle = row?.title?.trim() || ''
      if (nativeTitle && translated.get(text)?.shown === nativeTitle) translated.delete(text)
      const previous = translated.get(text)
      const original = previous?.original ?? text.data
      const renamed = key && named.get(key)
      if (renamed && (
        original === renamed.title ||
        nativeTitle === renamed.title
      )) named.delete(key)
      const saved = key && named.get(key)?.title
      const shown = saved
        ? saved
        : draftLabels.has(original) && !row?.title?.trim() && !row?.preview?.trim() ? words().fresh : original
      if (previous?.shown === shown) continue
      if (previous) restore(text, previous)
      if (shown === original) continue
      translated.set(text, { original, shown, label, tooltip: label.title })
      if (label.title === original) label.title = shown
      text.data = shown
    }
    // Hermes refreshes its session list on the broadcast below, but its
    // project tree can retain an older snapshot until the next tree refresh.
    // Keep the confirmed title visible on the matching row in the meantime.
    if (sidebarNamed.size) for (const button of document.querySelectorAll(`${sidebarChatRow} ${sidebarChatButton}`)) {
      const session = sidebarSession(button)
      const owner = session && sidebarOwner(session)
      if (!owner) continue
      const key = sessionOwnerKey(owner, session.id)
      const renamed = sidebarNamed.get(key)
      if (!renamed) continue
      const nativeTitle = session.title?.trim() || ''
      const label = button.querySelector('.hover-marquee-inner')
      const text = label?.childNodes.length === 1 ? label.firstChild : null
      if (nativeTitle === renamed.title) {
        sidebarNamed.delete(key)
        if (text instanceof Text) {
          const previous = translated.get(text)
          if (previous) {
            if (text.data === previous.shown) text.data = nativeTitle
            if (label.title === previous.shown) label.title = nativeTitle
            translated.delete(text)
          }
        }
        continue
      }
      // A cached tree can arrive out of order after several quick renames.
      // Check the owner-scoped stored value before accepting a different title.
      if (renamed.lastNativeTitle !== nativeTitle) {
        renamed.lastNativeTitle = nativeTitle
        checkSidebarTitle(owner, session.id, key, renamed)
      }
      if (!(text instanceof Text)) continue
      const previous = translated.get(text)
      if (previous?.shown === renamed.title) continue
      if (previous) restore(text, previous)
      translated.set(text, { original: text.data, shown: renamed.title, label, tooltip: label.title })
      if (label.title === text.data) label.title = renamed.title
      text.data = renamed.title
    }
    measureTitles(mainLabels)
    for (const key of named.keys()) if (!openIds.has(key)) named.delete(key)
  }
  const schedule = () => { frame ||= requestAnimationFrame(labels) }
  const sheet = document.createElement('style')
  sheet.dataset.hcvSessionTabs = ''
  sheet.textContent = sessionTabStyles(active)
  mountStyle(ctx, sheet)

  const observer = new MutationObserver((changes) => {
    if (!enabled()) return
    if (changes.some(({ target, addedNodes }) => {
      const element = target instanceof Element ? target : target.parentElement
      return element?.closest('[data-zone-tabstrip]') || (sidebarNamed.size && element?.closest(sidebarChatRow)) || [...addedNodes].some(node =>
        node instanceof Element && (node.matches(chatTab) || node.querySelector(chatTab) ||
          (sidebarNamed.size && (node.matches(sidebarChatRow) || node.querySelector(sidebarChatRow)))))
    })) schedule()
  })
  const themeObserver = new MutationObserver(() => {
    if (!enabled()) close()
    schedule()
  })
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme', 'lang'] })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })

  function targetState(target) {
    const current = target.sidebar ? sidebarSession(target.tab) : null
    const currentId = target.sidebar ? current?.id : tabId(target.tab)
    if (!enabled() || !target.tab.isConnected || currentId !== target.id) throw new Error('Chat changed')
    const currentOwner = current && sidebarOwner(current)
    if (current && (currentOwner?.connectionId !== target.owner?.connectionId ||
        currentOwner?.profile !== target.owner?.profile)) throw new Error('Chat owner changed')
    const owner = target.owner
    if (!owner?.connectionId || !owner.profile) throw new Error('Chat owner unavailable')
    if (!target.sidebar) {
      const row = tabSession(target.tab)?.session
      const actual = row && sessionRowOwner(row, host.state.connectionId.get())
      if (actual && (actual.connectionId !== owner.connectionId || actual.profile !== owner.profile)) {
        throw new Error('Chat owner changed')
      }
    }
    return { owner, current }
  }

  function remember(target, owner, id, title, previous) {
    const key = sessionOwnerKey(owner, id)
    named.set(key, { title, previous, owner, tab: target.tab })
    sidebarNamed.set(key, { title, previous })
    if (!disposed) {
      sessions.postMessage(1)
      schedule()
    }
  }

  async function recover(target, attemptedTitle) {
    const { owner, current } = targetState(target)
    if (!target.id || uncertainRpc.get(owner, target.id)) throw new Error('Previous rename cannot be verified safely')
    const result = await renameSession.recover(owner, target.id, attemptedTitle)
    if (result.title) remember(target, owner, target.id, result.title, current?.title?.trim() || target.title)
    return result
  }

  const unsettled = target => target.owner && (uncertainRpc.get(target.owner, target.id) ||
    (target.id ? renameSession.unsettled(target.owner, target.id) : null))

  async function save(target, title, fence) {
    const { owner, current } = targetState(target)
    const api = (id, options) => window.hermesDesktop.api({
      connectionId: owner.connectionId, profile: owner.profile,
      path: `/api/sessions/${encodeURIComponent(id)}`, ...options,
    })
    const previous = (target.sidebar ? current : tabSession(target.tab)?.session)?.title?.trim() || ''
    let id = target.id
    let finalTitle = title
    if (id) {
      try {
        const result = await renameSession(owner, id, title, fence)
        finalTitle = result.title || title
      } catch (error) {
        if (!(error instanceof MissingStoredSession) || !target.runtime) throw error
        // A just-created tile may still be missing its persisted session row.
        try {
          const result = await host.requestProfile({ ...owner, targetProfile: owner.profile }, 'session.title', {
            session_id: target.runtime, title,
          })
          finalTitle = result?.title || title
        } catch (rpcError) {
          uncertainRpc.mark(owner, id, title)
          throw rpcError
        }
      }
    } else {
      // Flush live text and attachments into the native handoff before the
      // main composer acquires a session id. The submit dispatcher would
      // consume the draft, so only invoke its underlying slash action.
      const submit = draftSubmit(target.tab)
      if (!submit || host.state.focusedStoredSessionId.get() || host.state.focusedSessionId.get()) {
        throw new Error('New chat not ready')
      }
      window.dispatchEvent(new CustomEvent('hermes:composer-draft-sync', {
        detail: { mode: 'flush', target: 'main' },
      }))
      try {
        await submit(`/title ${title}`, { attachments: [], displayKind: 'hidden' })
        const workspace = document.querySelector(workspaceTab)
        id = workspace && tabId(workspace)
        if (!id || id !== host.state.focusedStoredSessionId.get()) throw new Error('Chat changed')
        // Hermes announces the new session and moves the entire flushed draft
        // (including in-memory attachments) during the composer scope swap.
        // Writing text into the new scope here can race that swap: its native
        // migration refuses to replace a non-empty draft and leaves files behind.
        if ((await api(id)).title !== title) throw new Error('Title not saved')
      } catch (error) {
        uncertainRpc.mark(owner, id || null, title)
        throw error
      }
    }
    remember(target, owner, id, finalTitle, previous)
  }

  ctx.register({
    id: 'chat-tab-rename', area: TITLEBAR_AREAS.center,
    render: () => h(RenameSlot, { model, close, save, recover, unsettled }),
  })
  const showSidebarRename = async (button) => {
    if (!enabled() || !button?.isConnected || model.get() || openingSidebar) return
    const session = sidebarSession(button)
    const owner = session && sidebarOwner(session)
    if (!session || !owner) return
    openingSidebar = true
    const key = sessionOwnerKey(owner, session.id)
    const entry = sidebarNamed.get(key)
    const stale = Boolean(entry?.failed || entry?.checking)
    const version = stale ? (entry.readVersion = (entry.readVersion || 0) + 1) : null
    try {
      const query = new URLSearchParams({ profile: owner.profile })
      const title = await titleForOpen(stale,
        () => window.hermesDesktop.api({ ...owner, path: `/api/sessions/${encodeURIComponent(session.id)}?${query}` }),
        button.querySelector('.hover-marquee-inner')?.textContent.trim() || '')
      if (stale && sidebarNamed.get(key) === entry && entry.readVersion === version) {
        if (applyTitleRead(entry, version, title)) {
          const open = named.get(key)
          if (open) open.title = title
          schedule()
        }
      }
      const actual = sidebarSession(button)
      const actualOwner = actual && sidebarOwner(actual)
      if (!enabled() || !button.isConnected || model.get() || actual?.id !== session.id ||
          actualOwner?.connectionId !== owner.connectionId || actualOwner?.profile !== owner.profile) return
      const focused = session.id === host.state.focusedStoredSessionId.get()
      const focusedOwner = focused && host.state.focusedSessionOwner.get()
      const sameOwner = focusedOwner?.connectionId === owner.connectionId && focusedOwner?.profile === owner.profile
      model.set({ key: ++requestKey, tab: button, sidebar: true, id: session.id, title,
        words: words(), owner, runtime: sameOwner ? host.state.focusedSessionId.get() : null })
    } catch {
      if (stale && sidebarNamed.get(key) === entry && entry.readVersion === version) entry.failed = true
      if (enabled()) host.notify({ kind: 'error', message: words().unverified })
    } finally {
      openingSidebar = false
    }
  }
  const trackSidebarMenu = (event) => {
    const origin = event.target instanceof Element ? event.target : event.target?.parentElement
    const trigger = origin?.closest('button[aria-haspopup="menu"]')
    const row = trigger?.closest(sidebarChatRow)
    if (row && trigger !== row.querySelector(sidebarChatButton)) sidebarMenuTrigger = trigger
  }
  ctx.addEventListener(document, 'focusin', trackSidebarMenu, true)
  ctx.addEventListener(document, 'pointerdown', trackSidebarMenu, true)
  ctx.addEventListener(document, 'contextmenu', (event) => {
    const origin = event.target instanceof Element ? event.target : event.target?.parentElement
    sidebarContextRow = origin?.closest(sidebarChatRow) || null
    sidebarMenuTrigger = null
  }, true)
  ctx.addEventListener(document, 'click', (event) => {
    if (!enabled() || model.get()) return
    const origin = event.target instanceof Element ? event.target : event.target?.parentElement
    const item = origin?.closest('[role="menuitem"]')
    const menu = item?.closest('[role="menu"]')
    if (!item || !['Переименовать', 'Rename'].includes(item.textContent.trim())) return
    const trigger = sidebarMenuTrigger
    const dropdown = trigger?.isConnected && trigger.getAttribute('data-state') === 'open' &&
      menu?.id && menu.id === trigger.getAttribute('aria-controls')
    const context = sidebarContextRow?.isConnected && sidebarContextRow.getAttribute('data-state') === 'open' &&
      menu?.matches('[data-slot="context-menu-content"]') &&
      menu.getAttribute('aria-label') === sidebarContextRow.querySelector('button[data-session-actions]')?.getAttribute('aria-label')
    const row = dropdown ? trigger.closest(sidebarChatRow) : context ? sidebarContextRow : null
    const button = row?.querySelector(sidebarChatButton)
    if (!button || !sidebarSession(button) || !sidebarOwner(sidebarSession(button))) return
    event.preventDefault()
    event.stopImmediatePropagation()
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    requestAnimationFrame(() => { void showSidebarRename(button) })
  }, true)
  ctx.addEventListener(document, 'pointerdown', (event) => {
    const origin = event.target instanceof Element ? event.target : event.target?.parentElement
    const row = origin?.closest(sidebarChatRow)
    const button = row?.querySelector(sidebarChatButton)
    const session = button && sidebarSession(button)
    const owner = session && sidebarOwner(session)
    const entry = owner && sidebarNamed.get(sessionOwnerKey(owner, session.id))
    if (entry?.failed && !entry.checking) {
      entry.lastNativeTitle = undefined
      schedule()
    }
  }, true)
  ctx.addEventListener(document, 'dblclick', (event) => {
    if (!enabled() || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const origin = event.target instanceof Element ? event.target : event.target?.parentElement
    const sidebarRow = origin?.closest(sidebarChatRow)
    if (sidebarRow && !model.get()) {
      const button = sidebarRow.querySelector(sidebarChatButton)
      const control = origin.closest('button, a, input, [role="button"]')
      if (!button || (control && control !== button)) return
      const session = sidebarSession(button)
      if (!session || !sidebarOwner(session)) return
      event.preventDefault()
      event.stopPropagation()
      void showSidebarRename(button)
      return
    }
    const tab = origin?.closest(chatTab)
    if (!tab || model.get() || !tab.closest('[data-zone-tabstrip]')) return
    const control = origin.closest('button, a, input, [role="button"]')
    if (control && control !== tab) return
    event.preventDefault()
    event.stopPropagation()
    const id = tabId(tab)
    const label = tab.querySelector(labelSelector)
    const translation = translated.get(label?.firstChild)
    const focused = id === host.state.focusedStoredSessionId.get()
    const row = tabSession(tab)?.session
    const focusedOwner = focused && host.state.focusedSessionOwner.get()
    const group = tab.closest('[data-tree-group]')
    const isFocusedTab = focused && (!id || Boolean(group?.contains(document.activeElement)))
    const owner = sessionTabOwner(row, host.state.connectionId.get(), focusedOwner, isFocusedTab)
    if (!owner) return
    const sameOwner = focusedOwner?.connectionId === owner.connectionId && focusedOwner?.profile === owner.profile
    const title = translation && draftLabels.has(translation.original) && !named.has(sessionOwnerKey(owner, id))
      ? '' : label?.textContent.trim() || ''
    model.set({
      key: ++requestKey, tab, id, title, words: words(),
      owner, runtime: sameOwner ? host.state.focusedSessionId.get() : null,
    })
  }, true)

  schedule()
  ctx.onDispose(() => {
    disposed = true
    close()
    observer.disconnect()
    themeObserver.disconnect()
    cancelAnimationFrame(frame)
    labels()
    sessions.close()
    sheet.remove()
  })
}
