import { sessionRows } from './sidebar-chat-order.js'

const firstPage = 4
const nextPage = 10
const hidden = 'data-hcv-project-chat-hidden'
const nativeHidden = 'data-hcv-project-more-native'

// Hermes previews three rows and loads the remaining project rows on demand.
// Reuse that native load, then limit only their presentation in the Codex skin.
export function attachProjectMore(t) {
  const states = new Map()

  function restore(state) {
    for (const node of state.marked) node.removeAttribute(hidden)
    state.marked.clear()
    state.native?.removeAttribute(nativeHidden)
    state.native = undefined
    state.wrapper?.remove()
    state.wrapper = undefined
  }

  function clear(entry) {
    const state = states.get(entry)
    if (!state) return
    restore(state)
    states.delete(entry)
  }

  function nativeControl(list) {
    return [...list.children].find(node => node.querySelector(':scope > button[class~="group/more"]'))
  }

  function apply(entry, state) {
    const list = entry.region()
    if (!list) {
      restore(state)
      state.list = undefined
      state.limit = firstPage
      state.requested = false
      return
    }
    // Let the existing disclosure finish its closing animation first.
    if (entry.name.ariaExpanded === 'false') return
    if (state.list !== list) {
      restore(state)
      state.list = list
      state.limit = firstPage
      state.requested = false
    }
    const chats = sessionRows(list)
    if (list.hasAttribute('data-hcv-sidebar-ordered')) {
      chats.sort((a, b) => Number(a.anchor.style.getPropertyValue('--hcv-sidebar-order')) - Number(b.anchor.style.getPropertyValue('--hcv-sidebar-order')))
    }
    const native = nativeControl(list)
    // In the all-profiles view this native action navigates away instead of
    // loading the project. Keep it untouched in that view.
    const allProfiles = localStorage.getItem('hermes.desktop.showAllProfiles') === 'true'
    if (native && chats.length < firstPage && !state.requested && !allProfiles) {
      state.requested = true
      const button = native.querySelector('button[class~="group/more"]')
      queueMicrotask(() => {
        if (states.get(entry) === state && entry.region() === list && button?.isConnected && !button.disabled) button.click()
      })
    }
    // If loading is unavailable, retain Hermes' original control as a fallback.
    const ready = chats.length >= firstPage || !native
    const capped = ready && (chats.length > state.limit || Boolean(native))
    const nextMarked = new Set()
    if (ready) {
      for (const chat of chats.slice(state.limit)) for (const row of chat.rows) nextMarked.add(row)
    }
    for (const node of state.marked) if (!nextMarked.has(node)) node.removeAttribute(hidden)
    for (const node of nextMarked) if (!state.marked.has(node)) node.setAttribute(hidden, '')
    state.marked = nextMarked
    if (state.native !== native) state.native?.removeAttribute(nativeHidden)
    state.native = native
    if (native) native.toggleAttribute(nativeHidden, ready)

    if (capped) {
      if (!state.wrapper) {
        const wrapper = document.createElement('div')
        const button = document.createElement('button')
        wrapper.setAttribute('data-hcv-project-more', '')
        button.type = 'button'
        button.addEventListener('click', event => {
          const previous = state.limit
          state.limit += nextPage
          const current = sessionRows(list)
          if (current.length < state.limit) {
            const next = nativeControl(list)?.querySelector('button[class~="group/more"]')
            if (next && !next.disabled) next.click()
          }
          apply(entry, state)
          if (event.detail === 0) {
            const revealed = sessionRows(list).filter(chat => !chat.anchor.hasAttribute(hidden))[previous]
            revealed?.button.focus({ preventScroll: true })
          }
        })
        wrapper.append(button)
        state.wrapper = wrapper
      }
      const button = state.wrapper.firstElementChild
      const label = t('showMore')
      if (button.textContent !== label) button.textContent = label
      if (state.wrapper.parentElement !== list) list.append(state.wrapper)
    } else {
      state.wrapper?.remove()
      state.wrapper = undefined
    }
  }

  return {
    sync(entries) {
      const live = new Set(entries)
      for (const entry of states.keys()) if (!live.has(entry)) clear(entry)
      for (const entry of entries) {
        let state = states.get(entry)
        if (!state) {
          state = { limit: firstPage, marked: new Set(), requested: false }
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
  return `
    ${active} [${hidden}], ${active} [${nativeHidden}] { display: none !important; }
    ${active} [data-hcv-project-more] { padding: 4px 0 4px 28px; }
    ${active} [data-hcv-project-more] > button {
      display: inline-flex; align-items: center; height: 24px;
      margin-inline-start: -8px; padding: 0 8px; border: 0; border-radius: 6px;
      background: transparent; color: light-dark(#8f8f8f, #8a8a8a); cursor: pointer;
      font: 400 14px/20px var(--hcv-ui-font); white-space: nowrap;
    }
    ${active} [data-hcv-project-more] > button:hover { color: var(--hcv-text); }
    ${active} [data-hcv-project-more] > button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -1px; }
    @media (prefers-reduced-motion: no-preference) {
      ${active} [data-hcv-project-more] > button { transition: color 150ms ease; }
    }
  `
}
