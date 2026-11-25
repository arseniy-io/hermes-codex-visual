import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverRightBridge, readRightBridge, rightSideOpen, subscribeRightBridge, correctedRightLabel, relevantRightMutation } from '../source/right-sidebar-state.js'

const group = (id, panes, minimized = false) => ({ type: 'group', id, panes, active: panes[0], minimized })
const split = (orientation, children) => ({ type: 'split', id: 'root', orientation, children })
const pane = (id, data = {}) => ({ id, area: 'panes', data })
const paneList = [pane('sessions'), pane('workspace', { placement: 'main' }), pane('files', { collapsible: true })]
const frame = (right, extra = {}) => ({ tree: split('row', [group('left', ['sessions']), group('center', ['workspace']), right]),
  panes: paneList, hidden: new Set(), narrow: false, collapsed: new Set(), ...extra })

test('normal panel changes state when minimized or collapsed', () => {
  const right = group('right', ['files'])
  assert.equal(rightSideOpen(frame(right)), true)
  assert.equal(rightSideOpen(frame({ ...right, minimized: true })), false)
  assert.equal(rightSideOpen(frame(right, { collapsed: new Set(['right']) })), false)
  assert.equal(rightSideOpen(frame(right, { hidden: new Set(['files']) })), false)
  assert.equal(rightSideOpen(frame(right)), true)
})

test('flipped layout uses physical right side and not the files setting', () => {
  const tree = split('row', [group('left', ['files']), group('main', ['workspace']), group('right', ['sessions'])])
  assert.equal(rightSideOpen(frame(null, { tree, collapsed: new Set(['left']) })), true)
  assert.equal(rightSideOpen(frame(null, { tree, collapsed: new Set(['right']) })), false)
})

test('narrow, missing group and nested split fail closed', () => {
  assert.equal(rightSideOpen(frame(group('right', ['files']), { narrow: true })), null)
  assert.equal(rightSideOpen(frame(null, { tree: split('row', [group('left', ['sessions']), group('main', ['workspace'])]) })), null)
  assert.equal(rightSideOpen(frame(split('column', [group('nested', ['files'])]))), null)
  assert.equal(rightSideOpen({ tree: null }), null)
})

test('native labels and unread suffix follow the actual state in two languages', () => {
  const ru = { showRightSidebar: 'Показать правую панель', hideRightSidebar: 'Скрыть правую панель' }
  const en = { showRightSidebar: 'Show right sidebar', hideRightSidebar: 'Hide right sidebar' }
  assert.equal(correctedRightLabel('Скрыть правую панель', ru, false), ru.showRightSidebar)
  assert.equal(correctedRightLabel('Показать правую панель · 2 непрочитанных', ru, true), ru.hideRightSidebar + ' · 2 непрочитанных')
  assert.equal(correctedRightLabel('Hide right sidebar', en, false), en.showRightSidebar)
  assert.equal(correctedRightLabel('unknown', en, false), null)
  assert.equal(correctedRightLabel('Hide right sidebar', en, null), null)
})

function atom(value) {
  const listeners = new Set()
  return { get: () => value, set(next) { value = next; for (const fn of listeners) fn(next) },
    listen(fn) { listeners.add(fn); return () => listeners.delete(fn) }, count: () => listeners.size }
}
const callback = (fn, deps) => ({ memoizedState: [fn, deps] })
const useStore = store => callback(() => {}, [store, undefined])
const hooks = (...items) => items.reduceRight((next, item) => ({ ...item, next }), null)

function fixture() {
  const tree = frame(group('right', ['files'])).tree
  const stores = [atom(new Set()), atom(false), atom(false), atom(false), atom(new Set())]
  const treeStore = atom(tree)
  const subscriptions = new Set()
  const subscribe = fn => { subscriptions.add(fn); return () => subscriptions.delete(fn) }
  const read = () => paneList
  const root = { memoizedState: hooks(useStore(treeStore)), memoizedProps: {} }
  const component = { type() {}, memoizedProps: { node: tree, rootRow: true }, return: root,
    updateQueue: { memoCache: { data: [['panes', subscribe, 'panes', read]] } },
    memoizedState: hooks({ queue: { getSnapshot: read } }, ...stores.map(useStore)) }
  const element = { dataset: { treeSplit: 'root' } }
  const host = { return: component }
  const dom = { querySelectorAll: () => [element] }
  const readFiber = node => node === element ? host : null
  return { tree, treeStore, stores, component, subscriptions, read, subscribe, element, dom, readFiber }
}

test('discovers compiled cache and subscribes exactly once with cleanup', () => {
  const f = fixture()
  const bridge = discoverRightBridge(f.dom, f.readFiber)
  assert(bridge)
  assert.equal(readRightBridge(bridge), true)
  let calls = 0
  const stop = subscribeRightBridge(bridge, () => calls++)
  assert.equal(typeof stop, 'function')
  f.stores[4].set(new Set(['right']))
  assert.equal(calls, 1)
  assert.equal(readRightBridge(bridge), false)
  stop()
  assert.equal(f.stores.reduce((n, s) => n + s.count(), 0) + f.treeStore.count() + f.subscriptions.size, 0)
})

test('deduplicates identical stores; conflicting layouts fail closed', () => {
  const f = fixture()
  const second = { dataset: { treeSplit: 'root' } }
  const duplicate = { ...f.component }
  const dom = { querySelectorAll: () => [f.element, second] }
  const readFiber = node => ({ return: node === f.element ? f.component : duplicate })
  assert(discoverRightBridge(dom, readFiber))
  const other = fixture()
  const conflicting = { ...other.component, memoizedProps: { ...other.component.memoizedProps, node: other.tree } }
  const conflictingRead = node => ({ return: node === f.element ? f.component : conflicting })
  assert.equal(discoverRightBridge(dom, conflictingRead), null)
})

test('does not infer registry or tree from an unexpected component', () => {
  const f = fixture()
  f.component.updateQueue.memoCache.data = [['panes', f.subscribe, 'panes', () => []]]
  assert.equal(discoverRightBridge(f.dom, f.readFiber), null)
  f.component.updateQueue.memoCache.data = [['panes', f.subscribe, 'panes', f.read]]
  f.component.memoizedProps = { ...f.component.memoizedProps, node: { ...f.tree } }
  assert.equal(discoverRightBridge(f.dom, f.readFiber), null)
})

test('partial subscription failure undoes subscriptions', () => {
  const f = fixture()
  const bridge = discoverRightBridge(f.dom, f.readFiber)
  bridge.subscribePanes = () => { throw Error('failure') }
  assert.equal(subscribeRightBridge(bridge, () => {}), null)
  assert.equal(f.stores.reduce((n, s) => n + s.count(), 0) + f.treeStore.count(), 0)
})


function element({ chat = false, mirror = false, tree = false, cluster = false, control = false, descendants = [] } = {}) {
  return { nodeType: 1, chat, mirror, tree, cluster, control, descendants,
    closest(selector) { return selector.includes('data-chat-surface') && (this.chat || this.mirror) ? this : null },
    matches(selector) { return (selector.includes('data-tree-split') && this.tree) ||
      (selector.includes('data-titlebar-cluster') && this.cluster) || (selector.includes('data-tour') && this.control) },
    querySelector(selector) { return this.descendants.find(node => node.matches(selector)) || null },
    contains(node) { return this === node || this.descendants.includes(node) },
  }
}

test('observer ignores streaming and finds only relevant mounts or control changes', () => {
  const original = element({ control: true }), chat = element({ chat: true }), mirror = element({ mirror: true })
  const ordinary = element(), tree = element({ tree: true }), cluster = element({ cluster: true })
  for (let i = 0; i < 1000; i++) assert.equal(relevantRightMutation({ type: 'childList', target: chat,
    addedNodes: [ordinary], removedNodes: [] }, original), false)
  assert.equal(relevantRightMutation({ type: 'childList', target: mirror, addedNodes: [ordinary], removedNodes: [] }, original), false)
  assert.equal(relevantRightMutation({ type: 'childList', target: ordinary, addedNodes: [tree], removedNodes: [] }, original), true)
  assert.equal(relevantRightMutation({ type: 'childList', target: ordinary, addedNodes: [], removedNodes: [cluster] }, original), true)
  assert.equal(relevantRightMutation({ type: 'attributes', target: original, attributeName: 'aria-label' }, original), true)
  const fallbackButton = { ...original, closest(selector) { return selector.includes('data-tour') ? this : null } }
  assert.equal(relevantRightMutation({ type: 'attributes', target: fallbackButton, attributeName: 'title' }, null), true)
  assert.equal(relevantRightMutation({ type: 'attributes', target: ordinary, attributeName: 'aria-label' }, original), false)
  assert.equal(relevantRightMutation({ type: 'attributes', target: ordinary, attributeName: 'data-tour', oldValue: 'right-pane-toggle' }, original), true)
})
