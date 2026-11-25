// Read-only adapter for Hermes's native right-side tree state. Null means the
// exact contract is not available and the native button must remain untouched.
const isStore = value => value && typeof value.get === 'function' && typeof value.listen === 'function'
const safeGet = store => { try { return store.get() } catch { return undefined } }
const mainSurface = id => id === 'workspace' || id.startsWith('session-tile:') || id.startsWith('route-tile:')

function validNode(node, depth = 0) {
  if (!node || depth > 30 || typeof node.id !== 'string') return false
  if (node.type === 'group') return Array.isArray(node.panes) && node.panes.every(id => typeof id === 'string')
  return node.type === 'split' && ['row', 'column'].includes(node.orientation) &&
    Array.isArray(node.children) && node.children.length < 100 && node.children.every(child => validNode(child, depth + 1))
}
const paneIds = node => node.type === 'group' ? node.panes : node.children.flatMap(paneIds)

// Same rootRow, rightSideGroup, paneRootSide and shownPanesInGroup predicates
// as the installed Hermes renderer. Narrow overlays and non-leaf right sides
// have different semantics and deliberately return null.
export function rightSideOpen({ tree, panes, hidden, narrow, collapsed }) {
  if (!validNode(tree) || !Array.isArray(panes) || !(hidden instanceof Set) ||
      typeof narrow !== 'boolean' || narrow || !(collapsed instanceof Set) ||
      !panes.every(pane => pane && typeof pane.id === 'string')) return null
  const registry = new Map(panes.map(pane => [pane.id, pane]))
  if (registry.size !== panes.length) return null
  const placementMain = id => registry.get(id)?.data?.placement === 'main'
  const row = tree.type !== 'split' ? null : tree.orientation === 'row' ? tree :
    tree.children.find(child => child.type === 'split' && child.orientation === 'row' && paneIds(child).some(placementMain))
  if (!row) return null
  const edge = row.children.at(-1)
  if (!edge || edge.type !== 'group' || edge.panes.some(mainSurface) ||
      !row.children.some(child => paneIds(child).some(mainSurface))) return null
  const first = edge.panes[0]
  const index = row.children.findIndex(child => paneIds(child).includes(first))
  const mainIndices = row.children.flatMap((child, i) =>
    paneIds(child).some(id => id === 'workspace' || placementMain(id)) ? [i] : [])
  const side = index < 0 || !mainIndices.length ? null :
    index < mainIndices[0] ? 'left' : index > mainIndices.at(-1) ? 'right' : null
  const shown = edge.panes.some(id => {
    const pane = registry.get(id)
    return !!pane && !hidden.has(id) && !(narrow && !!pane.data?.collapsible)
  })
  return !edge.minimized && !(side && collapsed.has(side)) && shown
}

function callbacks(fiber) {
  const found = []
  for (let hook = fiber?.memoizedState; hook; hook = hook.next) {
    const state = hook.memoizedState
    if (Array.isArray(state) && state.length === 2 && typeof state[0] === 'function' && Array.isArray(state[1]))
      found.push({ fn: state[0], deps: state[1] })
  }
  return found
}

function stores(fiber) {
  return callbacks(fiber).flatMap(({ deps }) => {
    const candidate = deps.length === 2 && deps[1] === undefined ? deps[0] : null
    return isStore(candidate) ? [candidate] : []
  })
}

function registryCallbacks(fiber) {
  const pairs = []
  // Active Hermes uses React Compiler. Its useContributions('panes') has
  // useMemoCache(4) = ['panes', subscribe, 'panes', getSnapshot].
  const memo = fiber.updateQueue?.memoCache?.data
  if (Array.isArray(memo)) for (const row of memo) {
    if (!Array.isArray(row)) continue
    for (let i = 0; i + 3 < row.length; i++) if (row[i] === 'panes' &&
        typeof row[i + 1] === 'function' && row[i + 1].length === 1 && row[i + 2] === 'panes' &&
        typeof row[i + 3] === 'function' && row[i + 3].length === 0)
      pairs.push({ subscribe: row[i + 1], read: row[i + 3] })
  }
  // Uncompiled source retains useCallback functions in hook dependencies.
  if (!pairs.length) {
    const legacy = callbacks(fiber).filter(({ deps }) => deps.length === 1 && deps[0] === 'panes')
    const subscribe = legacy.filter(({ fn }) => fn.length === 1)
    const read = legacy.filter(({ fn }) => fn.length === 0)
    if (subscribe.length === 1 && read.length === 1) pairs.push({ subscribe: subscribe[0].fn, read: read[0].fn })
  }
  if (pairs.length !== 1) return null
  let panes
  try { panes = pairs[0].read() } catch { return null }
  if (!Array.isArray(panes) || !panes.length ||
      !panes.every(item => item && item.area === 'panes' && typeof item.id === 'string')) return null
  // The compiler cache must agree with the snapshot React itself uses.
  let matches = 0
  for (let hook = fiber.memoizedState; hook; hook = hook.next) {
    try { if (hook.queue?.getSnapshot?.() === panes) matches++ } catch {}
  }
  return matches ? { ...pairs[0], panes } : null
}

function rootRow(tree, registry) {
  if (!validNode(tree) || tree.type !== 'split') return null
  if (tree.orientation === 'row') return tree
  return tree.children.find(child => child.type === 'split' && child.orientation === 'row' &&
    paneIds(child).some(id => registry.get(id)?.data?.placement === 'main')) || null
}

function bridgeForSplit(fiber) {
  const all = stores(fiber)
  const values = all.map(safeGet)
  if (all.length !== 5 || !(values[0] instanceof Set) || typeof values[1] !== 'boolean' ||
      typeof values[2] !== 'boolean' || typeof values[3] !== 'boolean' || !(values[4] instanceof Set) ||
      [...values[4]].some(side => side !== 'left' && side !== 'right')) return null
  const registry = registryCallbacks(fiber)
  if (!registry) return null
  const roots = []
  for (let ancestor = fiber.return; ancestor; ancestor = ancestor.return) {
    for (const root of stores(ancestor)) if (validNode(safeGet(root))) roots.push(root)
  }
  const uniqueRoots = [...new Set(roots)]
  if (uniqueRoots.length !== 1) return null
  const tree = uniqueRoots[0]
  const byId = new Map(registry.panes.map(pane => [pane.id, pane]))
  if (byId.size !== registry.panes.length || rootRow(safeGet(tree), byId) !== fiber.memoizedProps?.node) return null
  return { tree, hidden: all[0], narrow: all[1], collapsed: all[4],
    readPanes: registry.read, subscribePanes: registry.subscribe, panes: registry.panes }
}

export function discoverRightBridge(document, committedFiber) {
  const found = []
  for (const node of document.querySelectorAll('[data-tree-split]')) {
    for (let fiber = committedFiber(node); fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps
      if (typeof fiber.type !== 'function' || props?.node?.type !== 'split' ||
          props.node.id !== node.dataset.treeSplit || props.node.orientation !== 'row' || !props.rootRow) continue
      const bridge = bridgeForSplit(fiber)
      if (bridge) found.push(bridge)
      break
    }
  }
  const unique = []
  for (const bridge of found) {
    if (!unique.some(item => item.tree === bridge.tree && item.hidden === bridge.hidden &&
        item.narrow === bridge.narrow && item.collapsed === bridge.collapsed && item.panes === bridge.panes))
      unique.push(bridge)
  }
  return unique.length === 1 ? unique[0] : null
}

export function readRightBridge(bridge) {
  try {
    return rightSideOpen({ tree: bridge.tree.get(), panes: bridge.readPanes(), hidden: bridge.hidden.get(),
      narrow: bridge.narrow.get(), collapsed: bridge.collapsed.get() })
  } catch { return null }
}

export function subscribeRightBridge(bridge, notify) {
  const stops = []
  try {
    for (const store of [bridge.tree, bridge.hidden, bridge.narrow, bridge.collapsed]) stops.push(store.listen(notify))
    stops.push(bridge.subscribePanes(notify))
    if (!stops.every(stop => typeof stop === 'function')) throw new Error('Invalid unsubscribe')
    return () => { for (const stop of stops) { try { stop() } catch {} } }
  } catch {
    for (const stop of stops) { try { if (typeof stop === 'function') stop() } catch {} }
    return null
  }
}

export function correctedRightLabel(original, titlebar, open) {
  if (typeof open !== 'boolean' || typeof original !== 'string' || !titlebar ||
      typeof titlebar.showRightSidebar !== 'string' || typeof titlebar.hideRightSidebar !== 'string') return null
  const prefixes = [titlebar.showRightSidebar, titlebar.hideRightSidebar]
  const prefix = prefixes.find(value => original === value || original.startsWith(value + ' · '))
  return prefix ? (open ? titlebar.hideRightSidebar : titlebar.showRightSidebar) + original.slice(prefix.length) : null
}

// Ignore ordinary chat/timeline mutations, including streaming. Tree and
// titlebar subscriptions handle state changes; the observer only rediscovers
// mounts/replacements and tracks props of the original control.
export function relevantRightMutation(record, original) {
  const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement
  if (!target || typeof target.closest !== 'function' ||
      target.closest('[data-hcv-right-mirror], [data-chat-surface]')) return false
  const selector = '[data-tree-split], [data-titlebar-cluster="right"], [data-tour="right-pane-toggle"]'
  if (record.type === 'childList') {
    if (original && (target === original || original.contains(target))) return true
    return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
      (node.matches(selector) || node.querySelector(selector)))
  }
  if (record.type !== 'attributes') return false
  // After fallback there is no retained `original`; still track the native
  // button by its stable tour marker so a changed contract can recover.
  if ((original && (target === original || original.contains(target))) ||
      target.closest('[data-tour="right-pane-toggle"]')) return true
  if (record.attributeName === 'data-tree-split' || record.attributeName === 'data-titlebar-cluster') return true
  if (record.attributeName === 'data-tour')
    return target.matches('[data-tour="right-pane-toggle"]') || record.oldValue === 'right-pane-toggle'
  return ['hidden', 'inert', 'data-pane-hidden'].includes(record.attributeName) &&
    ((original && target.contains(original)) || target.matches('[data-tree-split]') || target.querySelector('[data-tree-split]'))
}
