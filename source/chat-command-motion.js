import { observeWindowVisibility } from './window-visibility.js'

const caption = 'data-hcv-command-caption'
const sweep = 'data-hcv-command-sweep'
export const commandHandoff = 'data-hcv-command-handoff'
const enter = 'data-hcv-command-enter'
const sweepDuration = 1000
const sweepPeriod = 4000

// Codex Desktop 26.1120.6357.0: wbOy/xDs3, P8ef and Kd6L in the
// active renderer. Keep the highlight aligned to the text underneath it.
export function commandMotionStyles(chat) {
  const label = `${chat} [${caption}]`
  const viewport = `${label} > [data-hcv-command-viewport]`
  const text = `${viewport} > [data-hcv-command-text]`
  const mask = `${text} > [data-hcv-command-highlight]`
  const outgoing = `${label} > [data-hcv-command-outgoing]`
  const changing = `${label}[${commandHandoff}] > [data-hcv-command-viewport]`
  const sweeping = `${label}[${sweep}] [data-hcv-command-highlight]`
  const enteringRow = `${chat} [data-tool-row] > :first-child > div:has([${enter}])`
  return `
    ${label} {
      --hcv-command-base: color-mix(in srgb, var(--hcv-activity-foreground) 38.5%, transparent);
      display: inline-grid; vertical-align: top; min-width: 0; max-width: 100%; overflow: hidden;
      color: var(--hcv-command-base) !important;
      text-overflow: ellipsis;
    }
    ${viewport}, ${outgoing} { grid-area: 1 / 1; min-width: 0; }
    ${viewport} { display: grid; }
    ${text}, ${outgoing} { white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
    ${text} { position: relative; display: inline-block; align-self: start; }
    ${mask} {
      width: 100%; pointer-events: none; position: absolute; inset: 0 auto 0 0; overflow: hidden;
      text-overflow: inherit; transform: translateX(-50%);
      mask-image: linear-gradient(90deg, #0000 0%, #000 20% 30%, #0000 50% 100%);
    }
    ${mask}::before {
      content: attr(data-hcv-command-highlight) / "";
      width: 100%; display: block; overflow: hidden; transform: translateX(50%);
      text-overflow: inherit; color: #ffffffbf; -webkit-text-fill-color: currentColor;
    }
    ${sweeping}, ${sweeping}::before { animation: 1s steps(48, end); }
    ${sweeping} { animation-name: hcv-command-sweep; }
    ${sweeping}::before { animation-name: hcv-command-highlight; }
    @keyframes hcv-command-sweep { from { transform: translateX(-50%); } to { transform: translateX(125%); } }
    @keyframes hcv-command-highlight { from { transform: translateX(50%); } to { transform: translateX(-125%); } }

    ${outgoing} { pointer-events: none; animation: hcv-command-release .2s ease-out both; }
    ${outgoing}::before { content: attr(data-hcv-command-outgoing) / ""; }
    ${changing} {
      --hcv-command-offset: -108%; margin-right: -1em; overflow: hidden;
      mask-image: linear-gradient(90deg, #000 calc(100% - 1em), #0000);
    }
    ${changing} > [data-hcv-command-text] { --hcv-command-offset: 108%; border-right: 1em solid #0000; }
    ${changing}, ${changing} > [data-hcv-command-text] { animation: hcv-command-reveal 1s linear both; }
    ${enteringRow} { animation: hcv-command-receive .2s ease-out both; }
    @keyframes hcv-command-release { to { opacity: 0; } }
    @keyframes hcv-command-reveal { from { transform: translateX(var(--hcv-command-offset)); } 74%, to { transform: translateX(0); } }
    @keyframes hcv-command-receive { from { opacity: 0; } to { opacity: 1; } }

    /* A live command already has the Codex entry motion. Hermes's native
       translation would shift the entire label again on its first frame. */
    ${chat} [data-tool-group]:has(> [data-tool-summary] [${caption}]),
    ${chat} [data-tool-group]:has(> div > [data-tool-row] [${caption}]),
    ${chat} [data-tool-row]:has(> :first-child [${caption}]) { transform: none !important; }

    @media (prefers-reduced-motion: reduce) {
      ${sweeping}, ${sweeping}::before { animation: none; }
    }
  `
}

function initialVisibility(label) {
  const box = label.getBoundingClientRect()
  return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 &&
    box.top < window.innerHeight && box.left < window.innerWidth
}

function renderCaption(state, value, previous) {
  const { label } = state
  const viewport = document.createElement('span')
  viewport.setAttribute('data-hcv-command-viewport', '')
  const text = document.createElement('span')
  text.setAttribute('data-hcv-command-text', '')
  const highlight = document.createElement('span')
  highlight.setAttribute('data-hcv-command-highlight', value)
  highlight.setAttribute('aria-hidden', 'true')
  text.append(value, highlight)
  viewport.append(text)
  label.replaceChildren(viewport)
  if (previous) {
    const outgoing = document.createElement('span')
    outgoing.setAttribute('data-hcv-command-outgoing', previous)
    outgoing.setAttribute('aria-hidden', 'true')
    outgoing.inert = true
    viewport.before(outgoing)
    state.outgoing = outgoing
  }
  label.toggleAttribute(commandHandoff, Boolean(previous))
  state.value = value
}

export function createCommandMotion() {
  const states = new Map()
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const root = document.documentElement
  const visibility = observeWindowVisibility(refresh)
  const canPlay = state => state.visible && !visibility.hidden() &&
    (root.dataset.reducedMotion === 'false' || (root.dataset.reducedMotion !== 'true' && !reduced.matches))
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = states.get(entry.target)
      if (state) {
        state.visible = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0
        sync(state)
      }
    }
  })
  const preference = new MutationObserver(refresh)
  preference.observe(root, { attributes: true, attributeFilter: ['data-reduced-motion'] })
  reduced.addEventListener('change', refresh)

  function clearSweep(state) {
    state.label.removeAttribute(sweep)
    state.label.removeAttribute(commandHandoff)
    state.label.removeAttribute(enter)
    state.outgoing?.remove()
    state.outgoing = null
  }

  function stop(state) {
    window.clearTimeout(state.end)
    window.clearTimeout(state.repeat)
    state.end = 0
    state.repeat = 0
    clearSweep(state)
  }

  function start(state) {
    if (!state.label.isConnected || !canPlay(state)) return sync(state)
    state.label.setAttribute(sweep, '')
    state.end = window.setTimeout(() => {
      state.end = 0
      clearSweep(state)
      if (state.next !== state.value) commit(state, true)
    }, sweepDuration)
    state.repeat = window.setTimeout(() => {
      state.repeat = 0
      start(state)
    }, sweepPeriod)
  }

  function commit(state, transition) {
    stop(state)
    const previous = transition && canPlay(state) ? state.value : null
    renderCaption(state, state.next, previous)
    if (canPlay(state)) start(state)
  }

  function sync(state) {
    if (!state.label.isConnected || !canPlay(state)) {
      stop(state)
      if (state.next !== state.value) renderCaption(state, state.next, null)
    } else if (!state.end && !state.repeat) start(state)
  }

  function refresh() {
    for (const state of states.values()) sync(state)
  }

  function remove(label, value = label.textContent) {
    const state = states.get(label)
    if (state) {
      stop(state)
      observer.unobserve(label)
      states.delete(label)
      label.removeAttribute(caption)
    }
    if (label.textContent !== value || state) label.textContent = value
  }

  function set(label, value, workingCommand = false, standalone = false) {
    if (!workingCommand) return remove(label, value)
    let state = states.get(label)
    if (state) {
      state.next = value
      if (!state.end && value !== state.value) commit(state, true)
      return
    }
    state = { label, value: '', next: value, visible: false, end: 0, repeat: 0, outgoing: null }
    states.set(label, state)
    label.setAttribute(caption, '')
    renderCaption(state, value, null)
    state.visible = initialVisibility(label)
    if (standalone && canPlay(state)) label.setAttribute(enter, '')
    sync(state)
    observer.observe(label)
  }

  function prune() {
    for (const label of states.keys()) if (!label.isConnected) remove(label)
  }

  function clear() {
    for (const [label, state] of states) remove(label, state.next)
  }

  return { set, remove, prune, clear, dispose() {
    clear()
    observer.disconnect()
    preference.disconnect()
    reduced.removeEventListener('change', refresh)
    visibility.dispose()
  } }
}
