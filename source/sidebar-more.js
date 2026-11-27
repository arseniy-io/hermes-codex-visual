import { host } from '@hermes/plugin-sdk'
import { createElement as h, useLayoutEffect, useSyncExternalStore } from 'react'
import { projectTail, sessionRows } from './sidebar-chat-order.js'
import { committedFiber, nativeSidebarPortal } from './sidebar-recents.js'

const firstPage = 4
const nativeMore = 'button[class~="group/more"]'
const limited = 'data-hcv-project-limited'
const visible = 'data-hcv-project-chat-visible'
const revealMotion = 'data-hcv-project-reveal-motion'

export function createProjectRows() {
  const entries = new Map()
  const listeners = new Set()
  let snapshot = []
  function publish() {
    snapshot = [...entries.values()]
    for (const listener of listeners) listener()
  }
  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    update(entry, value) {
      entries.set(entry, value)
      publish()
    },
    clear(entry) {
      if (entries.delete(entry)) publish()
    },
  }
}

function ProjectTail({ view }) {
  useLayoutEffect(() => {
    view.committed = true
    queueMicrotask(view.sync)
  }, [view])
  return view.render(view.sessions)
}

export function NativeProjectRows({ rows }) {
  const views = useSyncExternalStore(rows.subscribe, rows.get)
  return views.map(view => nativeSidebarPortal(h(ProjectTail, { view }), view.container, view.key))
}

function readProjectProps(entry) {
  for (let fiber = committedFiber(entry.link); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (props?.project?.id === entry.id && typeof props.renderRows === 'function') return props
  }
}

const sessionKey = (owner, profile, id) => JSON.stringify([owner || connection(), profile || 'default', id])
const connection = () => host.state.connectionId.get()
const ownScope = () => [
  connection(), host.state.profile.get(), localStorage.getItem('hermes.desktop.showAllProfiles') === 'true',
]

function orderedChats(list) {
  const chats = sessionRows(list)
  if (list.hasAttribute('data-hcv-sidebar-ordered')) {
    const order = chat => Number(chat.anchor.style.getPropertyValue('--hcv-sidebar-order'))
    chats.sort((a, b) => order(a) - order(b))
  }
  return chats
}

function playReveal(state, from, newRows) {
  const list = state.list
  if (!newRows.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const to = list.getBoundingClientRect().height
  const animations = []
  const timing = { duration: 220, easing: 'ease-out' }
  if (from && Math.abs(to - from) >= 1) {
    list.setAttribute(revealMotion, '')
    animations.push(list.animate([{ height: `${from}px` }, { height: `${to}px` }], timing))
  }
  for (const row of newRows.slice(0, 12)) {
    animations.push(row.animate([{ opacity: 0, translate: '0 -3px' }, { opacity: 1, translate: '0 0' }], timing))
  }
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  const stop = () => {
    if (state.stopMotion !== stop) return
    state.stopMotion = undefined
    for (const animation of animations) animation.cancel()
    list.removeAttribute(revealMotion)
    media.removeEventListener('change', stop)
  }
  state.stopMotion = stop
  media.addEventListener('change', stop)
  void Promise.allSettled(animations.map(animation => animation.finished)).then(stop)
}

export function attachProjectMore(t, projectRows) {
  const states = new Map()
  const pendingTrees = new Map()
  let tailId = 0

  function active(entry, state) {
    return states.get(entry) === state && entry.region() === state.list &&
      entry.name.ariaExpanded === 'true' && state.scope === JSON.stringify(ownScope())
  }

  function clear(entry) {
    const state = states.get(entry)
    if (!state) return
    states.delete(entry)
    state.stopMotion?.()
    stopNative(state)
    state.list.removeAttribute(limited)
    for (const row of state.marked) row.removeAttribute(visible)
    state.wrapper?.remove()
    projectRows.clear(entry)
    state.tail?.remove()
  }

  function projectTree(owner, limit) {
    const key = JSON.stringify([owner, limit])
    if (!pendingTrees.has(key)) {
      const result = window.hermesDesktop.api({
        connectionId: owner,
        path: `/api/profiles/projects/tree?preview_limit=${limit}`,
        timeoutMs: 60_000,
      }).finally(() => pendingTrees.delete(key))
      pendingTrees.set(key, result)
    }
    return pendingTrees.get(key)
  }

  function requestExtra(entry, state, project, limit) {
    if (state.loading || state.failed) return
    state.loading = true
    void projectTree(connection(), limit).then(result => {
      if (!active(entry, state)) return
      const fromTree = result.projects?.find(node => node.id === project.id ||
        (project.mergeKey && node.mergeKey === project.mergeKey))
      if (!Array.isArray(fromTree?.previewSessions) ||
          (result.errors?.length && fromTree.sessionCount < project.sessionCount)) throw new Error('Incomplete project preview')
      const owner = connection()
      state.preview = fromTree.previewSessions.map(session =>
        owner && !session.connection_id ? { ...session, connection_id: owner } : session)
      state.fetched = limit
    }).catch(error => {
      if (!active(entry, state)) return
      state.failed = true
      if (state.reveal) host.notifyError(error, t('showMoreError'))
    }).finally(() => {
      state.loading = false
      if (active(entry, state)) apply(entry, state)
    })
  }

  function supplementalRows(entry, state, props, chats, limit) {
    const { project, renderRows, isSessionHidden } = props
    const native = chats.filter(chat => !state.tail?.contains(chat.anchor))
    const seen = new Set(native.map(chat => sessionKey(chat.connectionId, chat.profile, chat.id)))
    // The cross-profile tree merges counts and previews. Its ownership ids
    // can still describe just the first profile in the merged project.
    const ids = new Set(project.sessionIds ?? [])
    const members = ids.size === project.sessionCount ? ids : null
    const sessions = []
    for (const session of [...(project.previewSessions ?? []), ...(state.preview ?? [])]) {
      if (sessions.length >= limit - native.length) break
      const key = sessionKey(session.connection_id, session.profile, session.id)
      if (seen.has(key) || isSessionHidden?.(session) ||
          (members && !members.has(session.id) && !members.has(session._lineage_root_id))) continue
      seen.add(key)
      sessions.push(session)
    }
    if (!sessions.length && !state.tail) return
    if (!state.tail) {
      state.tail = document.createElement('div')
      state.tail.setAttribute(projectTail, '')
      state.list.append(state.tail)
    }
    // The callbacks belong to Hermes' mounted sidebar and retain its native
    // open, pin, archive and context menu behavior for the additional rows.
    if (state.view?.render === renderRows && state.view.sessions.length === sessions.length &&
        sessions.every((session, index) => state.view.sessions[index] === session)) return
    const view = state.view = {
      key: state.tailKey, container: state.tail, render: renderRows, sessions,
      sync: () => { if (active(entry, state) && state.view === view) apply(entry, state) },
    }
    projectRows.update(entry, view)
  }

  function stopNative(state) {
    state.nativeRequest?.dispose()
    state.nativeRequest = undefined
  }

  function loadNative(entry, state, button, count) {
    const request = state.nativeRequest
    if (request && (request.button !== button || request.count !== count)) stopNative(state)
    if (!button || button.disabled || state.nativeRequest || state.failed) return
    const settle = () => {
      stopNative(state)
      if (!active(entry, state)) return
      if (button.isConnected && sessionRows(state.list).length === count) state.failed = true
      apply(entry, state)
    }
    const observer = new MutationObserver(changes => {
      if (!button.disabled && changes.some(change => change.oldValue !== null)) settle()
    })
    observer.observe(button, { attributeFilter: ['disabled'], attributeOldValue: true })
    const timeout = setTimeout(settle, 30_000)
    state.nativeRequest = {
      button, count,
      dispose() {
        observer.disconnect()
        clearTimeout(timeout)
      },
    }
    queueMicrotask(() => {
      if (active(entry, state) && button.isConnected && !button.disabled) button.click()
    })
  }

  function updateButton(entry, state, show) {
    if (!show) {
      state.wrapper?.remove()
      state.wrapper = undefined
      return
    }
    if (!state.wrapper) {
      const wrapper = state.wrapper = document.createElement('div')
      wrapper.setAttribute('data-hcv-project-more', '')
      const button = document.createElement('button')
      button.type = 'button'
      wrapper.append(button)
      button.addEventListener('click', event => {
        if (!active(entry, state) || state.reveal) return
        state.failed = false
        stopNative(state)
        state.reveal = {
          height: state.list.getBoundingClientRect().height,
          keyboard: event.detail === 0,
          visibleRows: state.marked,
          button,
        }
        apply(entry, state)
      })
    }
    const button = state.wrapper.firstElementChild
    const label = t('showMore')
    if (button.textContent !== label) button.textContent = label
    button.toggleAttribute('data-hcv-project-more-loading', Boolean(state.reveal))
    if (state.reveal) button.setAttribute('aria-busy', 'true')
    else button.removeAttribute('aria-busy')
    if (state.wrapper.parentElement !== state.list) state.list.append(state.wrapper)
  }

  function apply(entry, state) {
    const { list } = state
    const chats = orderedChats(list)
    const native = list.querySelector(`:scope > div > ${nativeMore}`)
    const props = readProjectProps(entry)
    const count = Math.max(0, (props?.project.sessionCount ?? chats.length) - (props?.hiddenSessionCount ?? 0))
    const tree = list.closest('[data-sessions-mode="projects"]')
    const nativePreview = !state.allProfiles && Number(tree?.dataset.sessionsProjectPreviewLimit) >= firstPage
    const missingPreview = chats.length < firstPage && chats.length < count
    const noMore = state.expanded || (!native && !state.tail && chats.length <= firstPage)
    let waiting = false
    if (state.allProfiles && props && (native || state.tail)) {
      const target = state.expanded || state.reveal ? count : Math.min(count, firstPage)
      supplementalRows(entry, state, props, chats, target)
      const limit = state.expanded || state.reveal ? props.project.sessionCount : firstPage + (props.hiddenSessionCount ?? 0)
      if (chats.length < target && state.fetched < limit && !props.project.connectionId) {
        requestExtra(entry, state, props.project, limit)
      }
      waiting = Boolean(state.loading || state.view && !state.view.committed)
    } else if (native && (state.reveal || (!nativePreview && missingPreview))) {
      // Older Desktop builds provide three previews; their fourth row still
      // comes through the native expansion. A four-row native preview can
      // be short after filters, and the user can load those rows explicitly.
      loadNative(entry, state, native, chats.length)
      waiting = Boolean(state.nativeRequest || native.disabled)
    } else stopNative(state)

    const reveal = state.reveal
    const opened = reveal && !waiting && !state.failed
    const newChats = opened ? chats.filter(chat => !reveal.visibleRows.has(chat.anchor)) : []
    if (opened) state.expanded = true
    const next = new Set(state.expanded ? [] : chats.slice(0, firstPage).flatMap(chat => chat.rows))
    for (const row of state.marked) if (!next.has(row)) row.removeAttribute(visible)
    for (const row of next) if (!state.marked.has(row)) row.setAttribute(visible, '')
    state.marked = next
    list.toggleAttribute(limited, !state.expanded)
    if (opened || state.failed) state.reveal = undefined
    updateButton(entry, state, !state.expanded && (Boolean(state.reveal) ||
      (!noMore && (chats.length > firstPage || (count > firstPage && chats.length >= firstPage) ||
        (nativePreview && native && missingPreview) || state.failed))))

    if (opened) {
      // Start from the click's visible height even during a folder opening.
      entry.motion?.finishOpening()
      playReveal(state, reveal.height, newChats.flatMap(chat => chat.rows))
      if (reveal.keyboard && (document.activeElement === document.body || document.activeElement === reveal.button)) {
        const target = newChats[0]?.button ?? entry.name
        target.focus({ preventScroll: true })
      }
    }
  }

  return {
    sync(entries) {
      const live = new Set(entries)
      const scope = ownScope()
      const scopeKey = JSON.stringify(scope)
      for (const entry of states.keys()) if (!live.has(entry)) clear(entry)
      for (const entry of entries) {
        const list = entry.region()
        let state = states.get(entry)
        if (state && (!list || state.list !== list || state.scope !== scopeKey || state.closed && entry.name.ariaExpanded === 'true')) {
          clear(entry)
          state = undefined
        }
        if (!list) continue
        if (entry.name.ariaExpanded === 'false') {
          if (state) {
            state.closed = true
            state.stopMotion?.()
            stopNative(state)
          }
          continue
        }
        if (!state) {
          state = { list, scope: scopeKey, allProfiles: scope[2], marked: new Set(), fetched: 0, tailKey: String(++tailId) }
          states.set(entry, state)
        }
        apply(entry, state)
      }
    },
    clear,
    dispose() { for (const entry of states.keys()) clear(entry) },
  }
}

export function projectMoreStyles(active) {
  const previews = `${active} [data-sessions-mode="projects"] [data-sessions-project]:not([data-sessions-mode]) > div.grid`
  const session = '.row-hover:has(button[data-slot="row-button"])'
  const button = `${active} [data-hcv-project-more] > button`
  return `
    ${previews} > div:has(> ${nativeMore}) { display: none !important; }
    ${active} [${projectTail}] { display: contents; }
    ${active} [${limited}] > ${session}:not([${visible}]),
    ${active} [${limited}] > [${projectTail}] > ${session}:not([${visible}]) { display: none !important; }
    ${active} [${revealMotion}] { box-sizing: border-box; min-block-size: 0; overflow: clip; }
    ${active} [data-hcv-project-more] { order: 2147483647; padding-block: 2px; padding-inline: 20px 8px; }
    ${button} {
      display: inline-flex;
      align-items: center;
      min-block-size: 26px;
      max-inline-size: 100%;
      padding: 1px 8px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--hcv-sidebar-heading);
      cursor: pointer;
      font: 400 14px/20px var(--hcv-ui-font);
      text-align: start;
    }
    ${button}:hover, ${button}:focus-visible {
      background-color: var(--hcv-hover);
      color: var(--hcv-sidebar-row-text);
    }
    ${button}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 1px; }
    ${button}[data-hcv-project-more-loading] { cursor: progress; }
    @media (prefers-reduced-motion: no-preference) {
      ${button} { transition: background-color 120ms ease-out, color 120ms ease-out; }
    }
  `
}
