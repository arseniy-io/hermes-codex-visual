import { activityPresentation, describeActivity, pendingActivityPart, repeatedActivityPresentation } from './chat-activity-labels.js'
import { disclosureMotion } from './chat-disclosure-motion.js'

export const activityGroup = 'data-hcv-activity-group'
export const activityMember = 'data-hcv-activity-member'
export const activityRepeatGroup = 'data-hcv-activity-repeat'
export const activityRepeatMember = 'data-hcv-activity-repeat-member'
export const emptyActivityOwner = 'data-hcv-activity-empty-owner'
const assistant = '[data-slot="aui_assistant-message-root"]'
const content = '[data-slot="aui_assistant-message-content"]'
const thought = '[data-slot="aui_thinking-disclosure"]'
const tool = '[data-slot="tool-block"]'
const nativeSummary = ':scope > [data-tool-summary] button[aria-expanded]'
const protectedContent = ':is([data-approval-activity-only], [data-approval-stack], ' +
  '[data-clarify-choices], [data-clarify-late-choices], [data-clarify-batch-preview], ' +
  '[data-clarify-batch-question]:not([data-locked]), [data-delegate-card], [data-hcv-agent-rows])'

// Keep Hermes's original nodes and actions in their React-owned positions.
// A compact header covers the ordinary activity between two prose messages;
// agent cards and approvals remain outside; failed calls keep their original
// state and output in the expanded activity, as they do in Codex.
export function activityGroups(partsFor, setSite = () => {}, onNativeToggle = () => {},
  setLabel = (label, value) => { if (label.textContent !== value) label.textContent = value }) {
  const byResponse = new Map()
  const groupPanels = new WeakMap()
  const repeatPanels = new Map()

  function toggleNative(button) {
    button.click()
    onNativeToggle()
  }

  function restoreButton(state, button, change) {
    button.removeEventListener('click', change.onClick, true)
    if (button.isConnected && !change.touched && change.original !== change.expected &&
      button.getAttribute('aria-expanded') === change.expected) toggleNative(button)
    state.changed.delete(button)
  }

  function setNativeOpen(state, button, open) {
    if (!button || button.disabled) return
    const value = String(open)
    const current = button.getAttribute('aria-expanded')
    if (current == null || current === value) return
    let change = state.changed.get(button)
    if (!change) {
      change = { original: current, touched: false }
      change.onClick = event => {
        if (event.isTrusted || button.getAttribute(disclosureMotion) === 'closing') change.touched = true
      }
      state.changed.set(button, change)
      button.addEventListener('click', change.onClick, true)
    }
    change.expected = value
    toggleNative(button)
  }

  function syncOwners(response) {
    for (const root of response.children) {
      if (!root.matches(assistant)) continue
      const body = root.querySelector(`:scope > ${content}`)
      const children = body ? [...body.children] : []
      const onlyClosed = children.length > 0 && children.every(node => node.getAttribute(activityMember) === 'closed')
      const extras = [...root.children].filter(node => node !== body)
      const onlyHiddenExtras = extras.every(node => node.matches('[hidden], [aria-hidden="true"]'))
      root.toggleAttribute(emptyActivityOwner, onlyClosed && onlyHiddenExtras)
    }
  }

  function setOpen(state, open, updateOwners = true) {
    if (state.button.getAttribute('aria-expanded') !== String(open)) state.button.setAttribute('aria-expanded', String(open))
    for (const [index, node] of state.nodes.entries()) {
      const value = open ? (index === 0 ? 'first' : 'next') : 'closed'
      if (node.getAttribute(activityMember) !== value) node.setAttribute(activityMember, value)
      // The outer disclosure already hides a closed member. During a stream,
      // folding it for presentation needs no change to Hermes's own state.
      // An opened group still needs Hermes to mount its actual tool rows.
      if (open || updateOwners) setNativeOpen(state, node.querySelector(nativeSummary), open)
    }
    if (updateOwners) syncOwners(state.response)
  }

  function remove(state) {
    setSite(state.header, state.title, '')
    state.header.remove()
    for (const node of state.nodes) node.removeAttribute(activityMember)
    for (const [button, change] of state.changed) restoreButton(state, button, change)
  }

  function create(response, nodes) {
    const header = document.createElement('div')
    header.setAttribute(activityGroup, '')
    header.setAttribute('data-conversation-scaffold', '')
    const button = document.createElement('button')
    button.type = 'button'
    const title = document.createElement('span')
    const label = document.createElement('span')
    const caret = document.createElement('span')
    caret.setAttribute('aria-hidden', 'true')
    title.append(label)
    button.append(title, caret)
    header.append(button)
    // Codex IgqH.d defaults summary disclosures to closed. Native Hermes
    // auto-expansion is not a user preference; preserve only active focus.
    const wasOpen = nodes.some(node => node.contains(document.activeElement))
    const state = { response, header, button, title, label, nodes, changed: new Map() }
    groupPanels.set(button, nodes)
    nodes[0].before(header)
    button.addEventListener('click', () => setOpen(state, button.getAttribute('aria-expanded') !== 'true'))
    setOpen(state, wasOpen, false)
    return state
  }

  function present(parts, russian, running) {
    const descriptions = parts.map(describeActivity)
    const pending = running ? pendingActivityPart(parts) : undefined
    const selected = pending ? [pending] : parts
    const view = activityPresentation(selected, Boolean(pending), russian, false, true)
    if (!view) return null
    view.workingCommand = Boolean(pending && view.icon === 'activityTerminal')
    const browser = descriptions.find(item => item?.kind === 'chrome' || item?.kind === 'browser')
    if (browser && !pending && !descriptions.some(item => item?.sources?.length)) {
      view.icon = browser.icon
      view.site = descriptions.find(item => item?.kind === browser.kind && item.origin)?.origin
    }
    if (!view.label) {
      const kind = describeActivity(selected.at(-1))?.kind
      const labels = {
        skill: pending ? (russian ? 'Читает скилл' : 'Reading a skill') : (russian ? 'Прочитал скилл' : 'Read a skill'),
        image: pending ? (russian ? 'Смотрит изображения' : 'Viewing images') : (russian ? 'Просмотрел изображения' : 'Viewed images'),
      }
      view.label = labels[kind] || (russian ? 'Выполнил действия' : 'Completed actions')
    }
    return view
  }

  function sync(response, russian) {
    const previous = byResponse.get(response) ?? []
    if (!previous.length && !response.querySelector(tool)) return
    const running = Boolean(response.querySelector('[data-message-streaming="true"], [data-slot="aui_response-loading"], ' +
      '[data-slot="aui_turn-activity"][data-state="active"]'))
    const ranges = []
    let entries = []
    function settle() {
      const items = entries
      entries = []
      const nodes = items.map(item => item.node)
      const parts = items.flatMap(item => item.parts)
      // One native row already supplies its own disclosure and summary.
      if (nodes.length < 2 || !parts.length) return
      const view = present(parts, russian, running)
      if (view?.label) ranges.push({ nodes, view })
    }

    for (const root of response.children) {
      if (!root.matches(assistant)) {
        if (root.matches('[data-hcv-agent-rows], [data-slot="aui_system-message-root"]')) settle()
        continue
      }
      const body = root.querySelector(`:scope > ${content}`)
      if (!body) continue
      for (const node of body.children) {
        if (node.hasAttribute(activityGroup)) continue
        if (node.matches('[data-hcv-agent-rows], [data-delegate-card]') || node.querySelector('[data-delegate-card]')) {
          settle()
          continue
        }
        if (node.matches(thought)) {
          entries.push({ node, parts: [] })
          continue
        }
        if (node.matches(tool)) {
          const parts = partsFor(node)
          const descriptions = parts.map(describeActivity)
          if (node.matches('[aria-hidden="true"], [inert]')) continue
          // Keep user decisions and standalone image rows in timeline order.
          // Ordinary failures stay inside the action summary.
          if (node.matches(protectedContent) || node.querySelector(protectedContent) ||
            descriptions.some(item => item?.blocked) ||
            (descriptions.length && descriptions.every(item => item?.kind === 'image'))) {
            settle()
          } else if (parts.length && descriptions.every(item => item && (!item.pending || running))) {
            entries.push({ node, parts })
          }
          continue
        }
        // A blank streamed Markdown placeholder leaves the current run open.
        if (node.matches('[hidden], [aria-hidden="true"]')) continue
        if (node.matches(protectedContent) || node.querySelector(protectedContent)) {
          settle()
          continue
        }
        const paragraph = node.matches('.aui-md') ? node : node.querySelector('.aui-md')
        if (paragraph && (paragraph.textContent.trim() || paragraph.querySelector('img, audio, video, hr'))) settle()
      }
    }
    settle()

    const used = new Set()
    const previousByNode = new Map()
    for (const state of previous) for (const node of state.nodes) previousByNode.set(node, state)
    for (const range of ranges) {
      range.state = range.nodes.map(node => previousByNode.get(node)).find(state => state && !used.has(state))
      if (range.state) used.add(range.state)
    }
    for (const state of previous) if (!used.has(state)) remove(state)
    const next = ranges.map(({ state, nodes, view }) => {
      const group = state ?? create(response, nodes)
      if (state) {
        const nextNodes = new Set(nodes)
        for (const old of group.nodes) {
          if (nextNodes.has(old)) continue
          old.removeAttribute(activityMember)
          for (const [button, change] of group.changed) if (old.contains(button)) restoreButton(group, button, change)
        }
        group.nodes = nodes
        groupPanels.set(group.button, nodes)
        if (nodes[0].previousElementSibling !== group.header) nodes[0].before(group.header)
      }
      if (group.header.getAttribute(activityGroup) !== view.icon) group.header.setAttribute(activityGroup, view.icon)
      setLabel(group.label, view.label, view.workingCommand)
      setSite(group.header, group.title, view.site)
      setOpen(group, group.button.getAttribute('aria-expanded') === 'true', false)
      return group
    })
    if (next.length) byResponse.set(response, next)
    else byResponse.delete(response)
    syncOwners(response)
    syncRepeats(response, russian)
  }

  function setRepeatOpen(state, open) {
    state.button.setAttribute('aria-expanded', String(open))
    for (const [index, node] of state.nodes.entries()) {
      const value = open ? index ? 'next' : 'first' : 'closed'
      if (node.getAttribute(activityRepeatMember) !== value) node.setAttribute(activityRepeatMember, value)
    }
  }

  function removeRepeat(state) {
    state.header.remove()
    for (const node of state.nodes) node.removeAttribute(activityRepeatMember)
  }

  // Codex I3PO.Yg / NKAf.ef group consecutive successful calls to the same
  // tool. Hermes ToolRun combines every tool category, so it needs a nested
  // disclosure, preserving the React-owned rows and their individual actions.
  function syncRepeats(response, russian) {
    const containers = [...response.querySelectorAll('[data-tool-group] > div:not([data-tool-summary]):not([data-tool-ticker])')]
      .filter(node => node.querySelector(':scope > [data-tool-row][data-slot="tool-block"]'))
    for (const container of containers) {
      const previous = repeatPanels.get(container) || []
      const ranges = []
      let nodes = []
      let identity = ''
      function settle() {
        if (nodes.length > 1) {
          const view = repeatedActivityPresentation(nodes.flatMap(partsFor), russian)
          if (view) ranges.push({ nodes, view })
        }
        nodes = []
        identity = ''
      }
      for (const node of container.children) {
        if (node.hasAttribute(activityRepeatGroup)) continue
        const parts = node.matches('[data-tool-row][data-slot="tool-block"]') ? partsFor(node) : []
        const item = parts.length === 1 ? describeActivity(parts[0]) : null
        const source = item?.sources?.length === 1 ? item.sources[0] : null
        const key = item?.kind === 'integration' && item.repeatable !== false && !item.pending && !item.failed && !item.blocked && source && item.action
          ? source.key + ':' + source.tool + ':' + item.action : ''
        if (!key || identity && identity !== key) settle()
        if (key) {
          identity = key
          nodes.push(node)
        }
      }
      settle()
      const used = new Set()
      const previousByNode = new Map(previous.flatMap(state => state.nodes.map(node => [node, state])))
      const next = ranges.map(range => {
        let state = range.nodes.map(node => previousByNode.get(node)).find(state => state && !used.has(state))
        if (state) {
          used.add(state)
          for (const node of state.nodes) if (!range.nodes.includes(node)) node.removeAttribute(activityRepeatMember)
          state.nodes = range.nodes
        } else {
          const header = document.createElement('div')
          header.setAttribute('data-conversation-scaffold', '')
          const button = document.createElement('button')
          button.type = 'button'
          const title = document.createElement('span')
          const label = document.createElement('span')
          const caret = document.createElement('span')
          caret.setAttribute('aria-hidden', 'true')
          title.append(label)
          button.append(title, caret)
          header.append(button)
          state = { header, button, label, nodes: range.nodes }
          button.addEventListener('click', () => setRepeatOpen(state, button.getAttribute('aria-expanded') !== 'true'))
          setRepeatOpen(state, range.nodes.some(node => node.contains(document.activeElement)))
        }
        state.header.setAttribute(activityRepeatGroup, range.view.icon)
        state.label.textContent = range.view.label
        groupPanels.set(state.button, state.nodes)
        if (state.nodes[0].previousElementSibling !== state.header) state.nodes[0].before(state.header)
        setRepeatOpen(state, state.button.getAttribute('aria-expanded') === 'true')
        return state
      })
      for (const state of previous) if (!used.has(state)) removeRepeat(state)
      for (const state of next) setRepeatOpen(state, state.button.getAttribute('aria-expanded') === 'true')
      if (next.length) repeatPanels.set(container, next)
      else repeatPanels.delete(container)
    }
  }

  function prune() {
    for (const [container, states] of repeatPanels) {
      if (container.isConnected) continue
      for (const state of states) removeRepeat(state)
      repeatPanels.delete(container)
    }
    for (const [response, states] of byResponse) {
      if (response.isConnected) continue
      for (const state of states) remove(state)
      byResponse.delete(response)
    }
  }

  function clear() {
    for (const states of repeatPanels.values()) for (const state of states) removeRepeat(state)
    repeatPanels.clear()
    for (const [response, states] of byResponse) {
      for (const state of states) remove(state)
      for (const root of response.querySelectorAll(`[${emptyActivityOwner}]`)) root.removeAttribute(emptyActivityOwner)
    }
    byResponse.clear()
  }

  return { sync, prune, clear, has: response => byResponse.has(response), panels: button => groupPanels.get(button) }
}
