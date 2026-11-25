export function movedElementMatches(record, selector) {
  for (const nodes of [record.addedNodes, record.removedNodes]) {
    for (const node of nodes) {
      if (node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector))) return true
    }
  }
  return false
}
