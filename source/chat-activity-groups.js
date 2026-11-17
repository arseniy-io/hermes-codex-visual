import { activityPresentation, describeActivity } from './chat-activity-labels.js'
import { disclosureMotion } from './chat-disclosure-motion.js'

export const activityGroup = 'data-hcv-activity-group'
export const activityMember = 'data-hcv-activity-member'
const nativeSummary = ':scope > [data-tool-summary] button[aria-expanded]'
const ordinaryKinds = new Set(['edit', 'read', 'command'])

// Hermes reserves a separate slot for each diff. Give adjacent settled steps
// a shared disclosure while keeping the original rows in their React slots.
export function activityGroups(partsFor) {
  const byMessage = new Map()
  const groupPanels = new WeakMap()

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
    button.click()
  }

  function setOpen(state, open) {
    state.button.setAttribute('aria-expanded', String(open))
    if (open && state.initiallyClosed) {
      // Hermes initially opens successful diffs. In a disclosed activity
      // group the native diff is one click below the compact file row.
      for (const node of state.nodes) {
        if (node.matches('[data-file-edit]')) setNativeOpen(state, node.querySelector('button[aria-expanded]'), false)
      }
      state.initiallyClosed = false
    }
    for (const [index, node] of state.nodes.entries()) {
      node.setAttribute(activityMember, open ? (index === 0 ? 'first' : 'next') : 'closed')
      setNativeOpen(state, node.querySelector(nativeSummary), open)
    }
  }

  function remove(state) {
    state.header.remove()
    for (const node of state.nodes) node.removeAttribute(activityMember)
    for (const [button, change] of state.changed) {
      button.removeEventListener('click', change.onClick, true)
      if (button.isConnected && !change.touched && change.original !== change.expected &&
        button.getAttribute('aria-expanded') === change.expected) button.click()
    }
  }

  function create(nodes) {
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
    const wasOpen = nodes.some(node => node.contains(document.activeElement) ||
      node.querySelector('[data-tool-summary] button[aria-expanded="true"]'))
    const state = { header, button, label, nodes, initiallyClosed: !wasOpen, changed: new Map() }
    groupPanels.set(button, nodes)
    nodes[0].before(header)
    button.addEventListener('click', () => setOpen(state, button.getAttribute('aria-expanded') !== 'true'))
    setOpen(state, wasOpen)
    return state
  }

  function sync(message, russian) {
    const previous = byMessage.get(message) ?? []
    if (!previous.length && !message.querySelector(':scope > [data-tool-row]')) return
    const ranges = []
    let entries = []
    function settle() {
      const items = entries
      entries = []
      // Native runs already group adjacent reads and commands. Only combine
      // separate slots when there's a file edit among them.
      if (items.length < 2 || !items.some(item => item.edit)) return
      const nodes = items.map(item => item.node)
      const view = activityPresentation(items.flatMap(item => item.parts), false, russian)
      if (!view?.label) return
      const state = previous.find(item => item.nodes.length === nodes.length &&
        item.nodes.every((node, index) => node === nodes[index]))
      ranges.push({ state, nodes, view })
    }

    for (const node of message.children) {
      if (node.hasAttribute(activityGroup)) continue
      const parts = partsFor(node)
      const entriesForNode = parts.map(describeActivity)
      if (!parts.length || node.matches('[aria-hidden="true"], [inert]') ||
        entriesForNode.some(item => !item || !ordinaryKinds.has(item.kind) || item.pending || item.failed || item.blocked)) {
        settle()
        continue
      }
      entries.push({ node, parts, edit: entriesForNode.some(item => item.kind === 'edit') })
    }
    for (const state of previous) if (!ranges.some(range => range.state === state)) remove(state)
    const next = ranges.map(({ state, nodes, view }) => {
      const group = state ?? create(nodes)
      group.header.setAttribute(activityGroup, view.icon)
      if (group.label.textContent !== view.label) group.label.textContent = view.label
      return group
    })
    if (next.length) byMessage.set(message, next)
    else byMessage.delete(message)
  }

  function prune() {
    for (const [message, states] of byMessage) {
      if (message.isConnected) continue
      for (const state of states) remove(state)
      byMessage.delete(message)
    }
  }

  function clear() {
    for (const states of byMessage.values()) for (const state of states) remove(state)
    byMessage.clear()
  }

  return { sync, prune, clear, panels: button => groupPanels.get(button) }
}
