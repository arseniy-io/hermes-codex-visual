import { createElement as h, useRef, useState } from 'react'
import {
  atom, Button, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, host, Input, TITLEBAR_AREAS, useValue,
} from '@hermes/plugin-sdk'
import { codexIconRules } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'

const tilePrefix = 'session-tile:'
const workspaceTab = '[role="tab"][data-tree-tab="workspace"]'
const chatTab = `${workspaceTab}, [role="tab"][data-tree-tab^="${tilePrefix}"]`
const labelSelector = '.pane-tab-content .truncate'
const draftLabels = new Set(['New session', 'Untitled session', 'Новая сессия', 'Сеанс без названия'])
const copy = {
  ru: {
    fresh: 'Новый чат', title: 'Переименовать чат', hint: 'Кратко и узнаваемо',
    input: 'Название чата', placeholder: 'Добавить название…', cancel: 'Отмена',
    save: 'Сохранить', failed: 'Не удалось сохранить название. Попробуйте ещё раз.',
  },
  en: {
    fresh: 'New chat', title: 'Rename chat', hint: 'Keep it short and recognizable',
    input: 'Chat title', placeholder: 'Add a title…', cancel: 'Cancel',
    save: 'Save', failed: 'Couldn’t save the chat title. Try again.',
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

function draftSubmit(tab) {
  const group = tab.closest('[data-tree-group]')
  const input = group?.querySelector('[data-chat-surface][data-composer-target="main"] [data-slot="composer-rich-input"]')
  for (let node = committedFiber(input); node; node = node.return) {
    const props = node.memoizedProps
    if (typeof props?.onSubmit === 'function' && 'busy' in props && 'cwd' in props) return props.onSubmit
  }
  return null
}

// sidebarElectron.renameThreadDialog in Codex 26.1103.7773.0. The same
// compact form composition uses Hermes's Dialog primitives for focus/trapping.
function RenameForm({ target, close, save }) {
  const { words } = target
  const [value, setValue] = useState(target.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const input = useRef(null)
  const pending = useRef(false)
  const title = value.trim()
  const submit = async (event) => {
    event.preventDefault()
    if (!title || pending.current) return
    if (title === target.title) return close()
    pending.current = true
    setSaving(true)
    setError(false)
    try {
      await save(target, title)
      close()
    } catch {
      setError(true)
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
        disabled: saving, onChange: (event) => setValue(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
        },
      }),
      error && h('p', { role: 'alert', className: 'hcv-rename-error' }, words.failed),
      h(DialogFooter, null,
        h(Button, { type: 'button', variant: 'outline', disabled: saving, onClick: close }, words.cancel),
        h(Button, { type: 'submit', disabled: saving || !title }, words.save)))))
}

function RenameSlot({ model, close, save }) {
  const target = useValue(model)
  return target && h(RenameForm, { key: target.key, target, close, save })
}

function renameStyles(active) {
  const dialog = `${active} [data-hcv-rename-chat]`
  const close = `${dialog} [data-slot="dialog-close-button"]`
  return `
@media (forced-colors: none) {
  ${active} .hcv-rename-overlay { background: rgb(0 0 0 / 25%); backdrop-filter: none; }
  ${dialog} {
    inline-size: min(420px, calc(100vw - 32px));
    max-inline-size: none;
    border: 0;
    border-radius: 16px;
    background: var(--hcv-menu);
    color: var(--hcv-text);
    font-family: var(--hcv-ui-font);
  }
  ${dialog} .hcv-rename-body { padding: 20px; }
  ${dialog} form { display: flex; flex-direction: column; gap: 12px; }
  ${dialog} [data-slot="dialog-header"] { gap: 4px; padding-inline-end: 24px; text-align: start; }
  ${dialog} [data-slot="dialog-title"] { font-size: 20px; font-weight: 600; line-height: 26px; }
  ${dialog} [data-slot="dialog-description"] { color: var(--hcv-muted); font-size: 14px; line-height: 20px; }
  ${dialog} input[data-slot="input"] {
    block-size: 36px;
    padding: 0 10px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 8px;
    background: transparent;
    color: var(--hcv-text);
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
  ${dialog} button[type="submit"] { background: var(--hcv-action); color: var(--hcv-ink); }
  ${dialog} button[data-variant="outline"] {
    border: 1px solid var(--hcv-hairline);
    background: color-mix(in srgb, var(--hcv-text) 4%, var(--hcv-menu));
    color: var(--hcv-text);
  }
  ${close} { inset-block-start: 16px; inset-inline-end: 16px; inline-size: 24px; block-size: 24px; border-radius: 8px; }
  ${codexIconRules(`${close} > svg`, 'close')}
  ${dialog} .hcv-rename-error { margin: 0; color: var(--dt-destructive); font-size: 13px; }
}
`
}

export function registerSessionTabs(ctx, active) {
  const root = document.documentElement
  const model = atom(null)
  const translated = new Map()
  const named = new Map()
  const sessions = new BroadcastChannel('hermes:sessions')
  let requestKey = 0
  let frame = 0
  let disposed = false
  const words = () => root.matches(':lang(ru)') ? copy.ru : copy.en
  const close = () => model.set(null)
  const enabled = () => !disposed && root.matches(active)
  const restore = (text, entry) => {
    if (text.data === entry.shown) text.data = entry.original
    if (entry.label.title === entry.shown) entry.label.title = entry.tooltip
    translated.delete(text)
  }
  const labels = () => {
    frame = 0
    for (const [text, entry] of translated) {
      if (!enabled() || !text.isConnected || text.data !== entry.shown) restore(text, entry)
    }
    if (!enabled()) return
    const openIds = new Set()
    for (const tab of document.querySelectorAll(chatTab)) {
      const id = tabId(tab)
      openIds.add(id)
      const label = tab.querySelector(labelSelector)
      const text = label?.childNodes.length === 1 ? label.firstChild : null
      if (!(text instanceof Text)) continue
      const row = tabSession(tab)?.session
      const nativeTitle = row?.title?.trim() || ''
      if (nativeTitle && translated.get(text)?.shown === nativeTitle) translated.delete(text)
      const previous = translated.get(text)
      const original = previous?.original ?? text.data
      const renamed = named.get(id)
      if (renamed && (
        (row?.connection_id && row.connection_id !== renamed.owner.connectionId) ||
        (row?.profile && row.profile !== renamed.owner.profile) ||
        original === renamed.title ||
        (nativeTitle && nativeTitle !== renamed.previous)
      )) named.delete(id)
      const saved = named.get(id)?.title
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
    for (const id of named.keys()) if (!openIds.has(id)) named.delete(id)
  }
  const schedule = () => { frame ||= requestAnimationFrame(labels) }
  const sheet = document.createElement('style')
  sheet.dataset.hcvSessionTabs = ''
  sheet.textContent = renameStyles(active)
  document.head.append(sheet)

  const observer = new MutationObserver((changes) => {
    if (!enabled()) return
    if (changes.some(({ target, addedNodes }) => {
      const element = target instanceof Element ? target : target.parentElement
      return element?.closest('[data-zone-tabstrip]') || [...addedNodes].some(node =>
        node instanceof Element && (node.matches(chatTab) || node.querySelector(chatTab)))
    })) schedule()
  })
  const themeObserver = new MutationObserver(() => {
    if (!enabled()) close()
    schedule()
  })
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme', 'lang'] })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })

  async function save(target, title) {
    if (!enabled() || !target.tab.isConnected || tabId(target.tab) !== target.id) throw new Error('Chat changed')
    const owner = target.owner
    if (!owner?.connectionId || !owner.profile) throw new Error('Chat owner unavailable')
    const api = (id, options) => window.hermesDesktop.api({
      connectionId: owner.connectionId, profile: owner.profile,
      path: `/api/sessions/${encodeURIComponent(id)}`, ...options,
    })
    const previous = tabSession(target.tab)?.session?.title?.trim() || ''
    let id = target.id
    let finalTitle = title
    if (id) {
      try {
        const result = await api(id, { method: 'PATCH', body: { title, profile: owner.profile } })
        if (!result?.ok) throw new Error('Title not saved')
        finalTitle = result.title || title
      } catch (error) {
        if (!target.runtime) throw error
        // A just-created tile may still be missing its persisted session row.
        const result = await host.requestProfile({ ...owner, targetProfile: owner.profile }, 'session.title', {
          session_id: target.runtime, title,
        })
        finalTitle = result?.title || title
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
      const draft = await host.composer.getDraft('new')
      await submit(`/title ${title}`, { attachments: [], displayKind: 'hidden' })
      const workspace = document.querySelector(workspaceTab)
      id = workspace && tabId(workspace)
      if (!id || id !== host.state.focusedStoredSessionId.get()) throw new Error('Chat changed')
      const retained = await host.composer.getDraft(id)
      if (draft && !retained && !await host.composer.setDraft(id, draft)) throw new Error('Draft not restored')
      if ((await api(id)).title !== title) throw new Error('Title not saved')
    }
    named.set(id, { title: finalTitle, previous, owner })
    if (!disposed) {
      sessions.postMessage(1)
      schedule()
    }
  }

  ctx.register({
    id: 'chat-tab-rename', area: TITLEBAR_AREAS.center,
    render: () => h(RenameSlot, { model, close, save }),
  })
  ctx.addEventListener(document, 'dblclick', (event) => {
    if (!enabled() || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const origin = event.target instanceof Element ? event.target : event.target?.parentElement
    const tab = origin?.closest(chatTab)
    if (!tab || model.get() || !tab.closest('[data-zone-tabstrip]')) return
    const control = origin.closest('button, a, input, [role="button"]')
    if (control && control !== tab) return
    event.preventDefault()
    event.stopPropagation()
    const id = tabId(tab)
    const label = tab.querySelector(labelSelector)
    const translation = translated.get(label?.firstChild)
    const title = translation && draftLabels.has(translation.original) && !named.has(id)
      ? '' : label?.textContent.trim() || ''
    const focused = id === host.state.focusedStoredSessionId.get()
    const row = tabSession(tab)?.session
    const owner = focused ? host.state.focusedSessionOwner.get()
      : row?.connection_id && { connectionId: row.connection_id, profile: row.profile || 'default' }
    if (!owner) return
    model.set({
      key: ++requestKey, tab, id, title, words: words(),
      owner, runtime: focused ? host.state.focusedSessionId.get() : null,
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
