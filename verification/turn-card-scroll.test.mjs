import test from 'node:test'
import assert from 'node:assert/strict'
import { keepTurnCardHeader } from '../source/turn-card-scroll.js'

function setup() {
  let now = 0, currentTop = 100, observer, next = 0, scrollTop = 100
  let hidden = false, ownsHeader = true, writes = 0
  const frames = new Map(), timers = new Map(), listeners = new Map()
  const view = {
    performance: { now: () => now },
    ResizeObserver: class { constructor(fn) { this.fn = fn; observer = this } observe(node) { this.target = node } disconnect() { this.disconnected = true } },
    requestAnimationFrame(fn) { const id = ++next; frames.set(id, fn); return id },
    cancelAnimationFrame(id) { frames.delete(id) },
    setTimeout(fn, delay) { const id = ++next; timers.set(id, { fn, at: now + delay }); return id },
    clearTimeout(id) { timers.delete(id) },
  }
  const viewport = {
    get scrollTop() { return scrollTop }, set scrollTop(value) { writes++; scrollTop = value },
    contains: node => ownsHeader && node === header,
    addEventListener: (k, v) => listeners.set(k, v),
    removeEventListener: (k, v) => { if (listeners.get(k) === v) listeners.delete(k) },
  }
  const header = { isConnected: true, ownerDocument: { defaultView: view }, getBoundingClientRect: () => ({ top: currentTop }),
    closest: () => hidden ? viewport : null, contains: x => x === header }
  const turn = {}
  const move = value => { currentTop = value; observer.fn() }
  const advance = value => { now += value; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn() } }
  return { view, viewport, header, turn, move, advance, listeners, get observer() { return observer }, frames,
    hide() { hidden = true }, reparent() { ownsHeader = false }, get writes() { return writes } }
}

test('keeps the header in place after delayed layout and stops on user scroll', () => {
  const f = setup()
  keepTurnCardHeader(f.header, f.viewport, f.turn)
  assert.equal(f.observer.target, f.turn)
  f.move(125)
  assert.equal(f.viewport.scrollTop, 125)
  f.listeners.get('wheel')({ target: f.header })
  assert.equal(f.observer.disconnected, true)
  assert.equal(f.listeners.size, 0)
  assert.equal(f.frames.size, 0)
})

test('replaces an earlier anchor in the same viewport and cleans up after settling', () => {
  const f = setup()
  keepTurnCardHeader(f.header, f.viewport, f.turn)
  const first = f.observer
  const second = { ...f.header }
  keepTurnCardHeader(second, f.viewport, f.turn)
  assert.equal(first.disconnected, true)
  f.advance(350)
  assert.equal(f.observer.disconnected, true)
  assert.equal(f.listeners.size, 0)
})

test('keeps a recent resize anchored when native follow writes after the first timeout', () => {
  const f = setup()
  keepTurnCardHeader(f.header, f.viewport, f.turn)
  f.advance(180)
  f.move(100)
  f.advance(180)
  assert.equal(f.observer.disconnected, undefined)
  f.header.getBoundingClientRect = () => ({ top: 60 })
  f.listeners.get('scroll')()
  const pending = [...f.frames.values()]
  f.frames.clear()
  pending.forEach(fn => fn())
  assert.equal(f.viewport.scrollTop, 60)
  f.listeners.get('wheel')({ target: f.header })
  assert.equal(f.observer.disconnected, true)
})

test('does not repeat a scroll correction once the header has returned to its original position', () => {
  const f = setup()
  let contentTop = 200
  f.header.getBoundingClientRect = () => ({ top: contentTop - f.viewport.scrollTop })
  keepTurnCardHeader(f.header, f.viewport, f.turn)
  contentTop += 25
  f.move(0)
  assert.equal(f.viewport.scrollTop, 125)
  const pending = [...f.frames.values()]
  f.frames.clear()
  pending.forEach(fn => fn())
  assert.equal(f.viewport.scrollTop, 125)
  assert.equal(f.writes, 1)
})

for (const change of ['hide', 'reparent']) {
  test(`stops correcting a header when its pane is no longer its visible owner: ${change}`, () => {
    const f = setup()
    keepTurnCardHeader(f.header, f.viewport, f.turn)
    f[change]()
    f.move(140)
    assert.equal(f.viewport.scrollTop, 100)
    assert.equal(f.writes, 0)
    assert.equal(f.observer.disconnected, true)
    assert.equal(f.listeners.size, 0)
    assert.equal(f.frames.size, 0)
  })
}

test('does not write when a resize leaves the header in the same position', () => {
  const f = setup()
  keepTurnCardHeader(f.header, f.viewport, f.turn)
  f.move(100)
  assert.equal(f.writes, 0)
})
