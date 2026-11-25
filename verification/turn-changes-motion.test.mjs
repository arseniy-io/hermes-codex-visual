import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../source/turn-changes-card.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')
const api = new Function('codexMask', source + ';return {syncTurnChangesSpinner,turnChangesCardStyles}')(
  value => 'exact-source-mask:' + value)
const flush = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  const listeners = new Map(), documents = new Map()
  let observer, callbacks, phases = 0
  const animation = { animationName: 'hcv-turn-card-spin', pending: false, playState: 'running', ready: Promise.resolve(),
    get startTime() { return 0 }, set startTime(value) { assert.equal(value, 0); phases++ } }
  const node = { isConnected: true,
    getAnimations: options => { assert.equal(options.subtree, true); return [animation] },
    addEventListener: (key, value) => listeners.set(key, value),
    removeEventListener: (key, value) => { if (listeners.get(key) === value) listeners.delete(key) } }
  const document = { hidden: false, defaultView: { IntersectionObserver: class {
    constructor(callback) { callbacks = callback; observer = this }
    observe(value) { assert.equal(value, node) }
    disconnect() { this.disconnected = true }
  } }, addEventListener: (key, value) => documents.set(key, value),
  removeEventListener: (key, value) => { if (documents.get(key) === value) documents.delete(key) } }
  node.ownerDocument = document
  const stop = api.syncTurnChangesSpinner(node)
  return { node, document, animation, listeners, documents, stop,
    phaseCount: () => phases, get observer() { return observer },
    visible: isIntersecting => callbacks([{ target: node, isIntersecting }]) }
}

test('pending glyph uses the original FyDI artwork at 14px with exact stepped motion and reduced-motion behavior', () => {
  const css = api.turnChangesCardStyles('[data-fixture]')
  assert.match(css, /inline-size:14px; block-size:14px/)
  assert.match(css, /\[data-hcv-turn-card-apply\]\[aria-busy="true"\] \{ --hcv-turn-card-glyph:exact-source-mask:sidebarWorking/)
  assert.match(css, /animation:hcv-turn-card-spin 2s steps\(60,end\) infinite/)
  assert.match(css, /@media\(prefers-reduced-motion:no-preference\)/)
  assert.match(css, /:root\[data-reduced-motion="false"\]/)
  assert.match(css, /:root:not\(\[data-reduced-motion\]\)/)
})

test('visible spinners synchronize to the source timeline; hidden and disposed nodes keep their phase untouched', async () => {
  const f = fixture()
  await flush()
  assert.equal(f.phaseCount(), 0)
  f.visible(true); await flush()
  assert.equal(f.phaseCount(), 1)
  f.document.hidden = true
  f.documents.get('visibilitychange')(); await flush()
  assert.equal(f.phaseCount(), 1)
  f.document.hidden = false
  f.documents.get('visibilitychange')(); await flush()
  assert.equal(f.phaseCount(), 2)
  f.visible(false)
  f.listeners.get('animationstart')({ target: f.node, animationName: 'hcv-turn-card-spin' }); await flush()
  assert.equal(f.phaseCount(), 2)
  f.stop()
  assert.equal(f.observer.disconnected, true)
  assert.equal(f.listeners.size, 0)
  assert.equal(f.documents.size, 0)
})

test('disposing while an animation waits for readiness prevents a late phase write', async () => {
  const f = fixture()
  let ready
  f.animation.ready = new Promise(resolve => { ready = resolve })
  f.visible(true); await flush()
  f.stop(); ready(); await flush()
  assert.equal(f.phaseCount(), 0)
})
