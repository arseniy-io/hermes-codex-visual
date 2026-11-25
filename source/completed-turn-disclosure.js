const response = '[data-slot="aui_response-group"]'
const assistant = '[data-slot="aui_assistant-message-root"]'
const content = '[data-slot="aui_assistant-message-content"]'
const background = '[data-slot="aui_background-result"]'
const step = ':is([data-conversation-scaffold]:not([role="status"]), [data-slot="tool-block"], [data-slot="aui_reasoning-text"], [data-hcv-agent-rows])'
const protectedStep = ':is([role="alert"], [data-approval-activity-only], [data-approval-stack], [data-clarify-choices], [data-clarify-late-choices], [data-clarify-batch-preview], [data-clarify-batch-question]:not([data-locked]), [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_changed-files"], [data-hcv-saved-turn-card], svg.text-destructive[aria-label])'
const workAttr = 'data-hcv-turn-step'
const deferredAttr = 'data-hcv-turn-deferred'
const foldedAttr = 'data-hcv-turn-folded'
// Codex enables activity windows at 48 rows, with windows of 12. The
// Hermes plugin cannot unmount the host's React children; defer their paint
// and layout without copying the history or moving native nodes.
const windowSize = 12
const threshold = 48
const motionPanels = new WeakMap()

export function completedWorkSteps(group, final, { isInterim = () => false } = {}) {
  const steps = []
  const owned = node => node.closest(response) === group
  const protect = node => node.matches(protectedStep) || [...node.querySelectorAll(protectedStep)].some(owned)
  const nestedGroup = node => node.querySelector(response)
  const add = node => { if (!protect(node) && !nestedGroup(node)) steps.push(node) }
  let sawFinal = false
  for (const row of group.children) {
    if (row === final) sawFinal = true
    if (row.matches(background)) {
      // Standalone notifications that arrived after the answer still need
      // to announce themselves, until a subsequent answer incorporates them.
      if (!sawFinal) add(row)
      continue
    }
    if (!row.matches(assistant)) continue
    const body = row.querySelector(`:scope > ${content}`)
    if (!body) continue
    // React renders one markdown surface per nonempty text part. Stay at its
    // own level: tool output and nested previews may render Markdown too.
    const children = [...body.children]
    const prose = '.aui-md:not([data-hcv-stop-diagnostic])'
    const lastTextIndex = children.findLastIndex(child => child.matches(prose))
    const lastWorkIndex = children.findLastIndex((child, index) => index < lastTextIndex && child.matches(step))
    const interim = row !== final && isInterim(row)
    if (row !== final && !protect(row) && !nestedGroup(row) && (interim || (lastTextIndex < 0 && children.some(child => child.matches(step))))) {
      add(row)
      continue
    }
    for (const [index, child] of children.entries()) {
      if (child.matches(step)) add(child)
      // Only an explicit interim or a later work boundary separates this
      // prose from the answer. Keep all prose after the last such boundary.
      else if (child.matches(prose) && (row !== final ? interim : index < lastWorkIndex)) add(child)
    }
  }
  return steps
}

export function setWorkOpen(group, state, open) {
  if (!open) {
    const focused = group.ownerDocument.activeElement?.closest(`[${workAttr}]`)
    if (state.steps.has(focused)) state.bar.focus({ preventScroll: true })
  }
  group.toggleAttribute(foldedAttr, !open)
  state.bar.setAttribute('aria-expanded', String(open))
}

export function syncWorkSteps(group, state, steps) {
  const next = new Set(steps)
  for (const node of state.steps) {
    if (next.has(node)) continue
    node.removeAttribute(workAttr)
    node.removeAttribute(deferredAttr)
  }
  const long = group.toggleAttribute('data-hcv-turn-long', steps.length >= threshold)
  for (const [index, node] of steps.entries()) {
    if (!state.steps.has(node)) node.setAttribute(workAttr, '')
    node.toggleAttribute(deferredAttr, long && index >= windowSize)
  }
  state.steps = next
  if (state.bar) {
    if (steps.length) motionPanels.set(state.bar, long ? steps.slice(0, windowSize) : steps)
    else motionPanels.delete(state.bar)
    if (state.bar.getAttribute('aria-expanded') === 'false') {
      // A native update can introduce another step while the section is
      // closed. Do not make a currently focused control disappear silently.
      setWorkOpen(group, state, false)
    }
  }
}

export function workMotionPanels(button) {
  const group = button.parentElement
  return (motionPanels.get(button) || []).filter(node => node.closest(response) === group)
}
