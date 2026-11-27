import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const sourcePath = process.env.HCV_COMPOSER_CLEARANCE_FILE ||
  (fs.existsSync(new URL('../source/composer-clearance.js', import.meta.url))
    ? new URL('../source/composer-clearance.js', import.meta.url)
    : new URL('./composer-clearance.js', import.meta.url))
const source = fs.readFileSync(sourcePath, 'utf8').replace('export function ', 'function ')
const { createComposerClearanceMetrics } = new Function(source + '; return { createComposerClearanceMetrics }')()
const dockVar = '--hcv-composer-dock-height'
const editorVar = '--hcv-composer-surface-height'
const previousDock = '--hcv-last-composer-dock-height'
const previousEditor = '--hcv-last-composer-surface-height'

function fixture(dockHeight = 159, editorHeight = 98) {
  const values = new Map([['--composer-measured-height', '160px'], ['--composer-surface-measured-height', '96px']])
  const writes = []
  const root = { isConnected: true, currentCSSZoom: 1, hidden: false, hud: false,
    style: { getPropertyValue: key => values.get(key) || '',
      setProperty(key, value) { values.set(key, value); writes.push([key, value]) },
      removeProperty(key) { values.delete(key) } },
    closest(selector) { return selector.includes('data-hud-shell') ? (root.hud ? root : null) : root.hidden ? root : null },
    querySelector() { return root.dock.popped ? null : root.dock },
  }
  root.dock = { isConnected: true, popped: false, height: dockHeight,
    hasAttribute() { return this.popped },
    getBoundingClientRect() { return { height: this.height, top: 0 } },
    querySelector() { return root.editor },
  }
  root.editor = { isConnected: true, height: editorHeight,
    getBoundingClientRect() { return { height: this.height, top: 51 } },
  }
  return { root, values, writes }
}
function observer() {
  const unrelated = {}
  const targets = new Set([unrelated])
  return { unrelated, targets, observe: node => targets.add(node), unobserve: node => targets.delete(node) }
}

test('publishes exact local heights without changing native coarse metrics or republishing unchanged geometry', () => {
  const a = fixture(), b = fixture(220.25, 127.5), ro = observer()
  const metrics = createComposerClearanceMetrics()
  metrics.sync([a.root, b.root], ro)
  assert.equal(a.values.get(dockVar), '159px')
  assert.equal(a.values.get(editorVar), '98px')
  assert.equal(b.values.get(dockVar), '220.25px')
  assert.equal(b.values.get(editorVar), '127.5px')
  assert.equal(a.values.get('--composer-measured-height'), '160px')
  assert.equal(a.values.get('--composer-surface-measured-height'), '96px')
  metrics.resize([{ target: a.root.dock }, { target: a.root.editor }, { target: ro.unrelated }])
  assert.equal(a.writes.length, 3)
  a.root.dock.height = 181.25
  a.root.editor.height = 119.5
  metrics.resize([{ target: a.root.dock }])
  assert.equal(a.values.get(dockVar), '181.25px')
  assert.equal(a.values.get(editorVar), '119.5px')
  assert.equal(b.values.get(dockVar), '220.25px')
})

test('theme disable and disposal clear only owned properties and observations', () => {
  const a = fixture(), ro = observer(), metrics = createComposerClearanceMetrics()
  metrics.sync([a.root], ro)
  assert.equal(ro.targets.size, 3)
  metrics.sync([], ro)
  assert(!a.values.has(dockVar) && !a.values.has(editorVar))
  assert.deepEqual([...ro.targets], [ro.unrelated])
  metrics.sync([a.root], ro)
  metrics.dispose(ro)
  assert(!a.values.has(dockVar) && !a.values.has(editorVar))
  assert.deepEqual([...ro.targets], [ro.unrelated])
  metrics.resize([{ target: a.root.dock }])
  assert(!a.values.has(dockVar))
})

test('replacement and popout clear stale measurements while a hidden chat retains its last visible heights', () => {
  const a = fixture(), ro = observer(), metrics = createComposerClearanceMetrics()
  metrics.sync([a.root], ro)
  const old = a.root.editor
  a.root.editor = { ...old, height: 141.25 }
  metrics.sync([a.root], ro)
  assert(!ro.targets.has(old))
  assert(ro.targets.has(a.root.editor))
  assert.equal(a.values.get(editorVar), '141.25px')
  a.root.dock.popped = true
  metrics.resize([{ target: a.root.dock }])
  assert(!a.values.has(dockVar))
  metrics.sync([a.root], ro)
  assert.deepEqual([...ro.targets], [ro.unrelated])
  a.root.dock.popped = false
  metrics.sync([a.root], ro)
  a.root.hidden = true
  a.root.dock.height = 171.5
  a.root.editor.height = 144
  metrics.resize([{ target: a.root.editor }])
  metrics.sync([a.root], ro)
  assert.equal(a.values.get(dockVar), '159px')
  assert.equal(a.values.get(editorVar), '141.25px')
  a.root.hidden = false
  metrics.sync([a.root], ro)
  assert.equal(a.values.get(dockVar), '171.5px')
  assert.equal(a.values.get(editorVar), '144px')
  a.root.isConnected = false
  metrics.resize([{ target: a.root.dock }])
  assert(!a.values.has(dockVar))
})

test('uses the owning CSS zoom and excludes HUD geometry', () => {
  const a = fixture(318, 196), hud = fixture(1, 1), ro = observer()
  a.root.currentCSSZoom = 2
  hud.root.hud = true
  const metrics = createComposerClearanceMetrics()
  metrics.sync([a.root, hud.root], ro)
  assert.equal(a.values.get(dockVar), '159px')
  assert.equal(a.values.get(editorVar), '98px')
  assert(!hud.values.has(dockVar))
  assert(!ro.targets.has(hud.root.dock))
})

test('retains primary geometry only for a return to the same owner and width', () => {
  const pane = fixture().root
  pane.clientWidth = 1000
  const a = fixture(230, 150)
  a.root.dataset = { composerTarget: 'main' }
  const closest = a.root.closest
  a.root.closest = selector => selector === '[data-tree-group="grp-main"]' ? pane : closest(selector)
  const ro = observer()
  const metrics = createComposerClearanceMetrics(() => 'workspace-chat')
  metrics.sync([a.root], ro)
  assert.equal(pane.style.getPropertyValue(previousDock), '230px')
  assert.equal(pane.style.getPropertyValue(previousEditor), '150px')

  metrics.restoreFallback('command-center')
  metrics.sync([], ro)
  assert.equal(pane.style.getPropertyValue(previousDock), '')
  metrics.restoreFallback('another-owner')
  assert.equal(pane.style.getPropertyValue(previousDock), '')
  metrics.restoreFallback('workspace-chat')
  assert.equal(pane.style.getPropertyValue(previousEditor), '150px')

  pane.clientWidth = 800
  metrics.restoreFallback('workspace-chat')
  assert.equal(pane.style.getPropertyValue(previousDock), '')
  metrics.sync([a.root], ro)
  assert.equal(pane.style.getPropertyValue(previousDock), '230px')
  a.root.dock.popped = true
  metrics.sync([a.root], ro)
  metrics.restoreFallback('workspace-chat')
  assert.equal(pane.style.getPropertyValue(previousDock), '')

  a.root.dock.popped = false
  metrics.sync([a.root], ro)
  metrics.sync([], ro, false)
  metrics.restoreFallback('workspace-chat')
  assert.equal(pane.style.getPropertyValue(previousEditor), '')
})

test('retained workspace chat keeps local clearance without mutating the main pane on navigation', () => {
  const a = fixture(230, 150), ro = observer()
  a.root.dataset = { composerTarget: 'main' }
  const closest = a.root.closest
  a.root.closest = selector => {
    if (selector === '[data-tree-group="grp-main"]') assert.fail('Retained chat does not measure the pane')
    return selector === '[data-workspace-chat-layer]' ? a.root : closest(selector)
  }
  const metrics = createComposerClearanceMetrics(() => 'workspace-chat')

  metrics.sync([a.root], ro)
  metrics.restoreFallback('messaging')
  a.root.hidden = true
  metrics.sync([a.root], ro)
  metrics.restoreFallback('workspace-chat')

  assert.equal(a.values.get(dockVar), '230px')
  assert.equal(a.values.get(editorVar), '150px')
  assert.equal(a.writes.length, 3)
})
