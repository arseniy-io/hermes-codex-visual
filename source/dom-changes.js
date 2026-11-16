export function movedElementMatches(record, selector) {
  for (const nodes of [record.addedNodes, record.removedNodes]) {
    for (const node of nodes) {
      if (node instanceof Element && (node.matches(selector) || node.querySelector(selector))) return true
    }
  }
  return false
}
