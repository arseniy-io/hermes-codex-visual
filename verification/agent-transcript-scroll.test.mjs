import assert from 'node:assert/strict'
import { attachAgentTranscriptScroll } from '../source/agent-transcript-scroll.js'

function feed() {
  const listeners = new Map()
  let top = 0
  const element = {
    scrollHeight: 2000, clientHeight: 400, firstElementChild: {},
    get scrollTop() { return top },
    set scrollTop(value) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)) },
    addEventListener(name, fn) { listeners.set(name, fn) },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name) },
  }
  let resize
  const observed = []
  const detach = attachAgentTranscriptScroll(element, class {
    constructor(fn) { resize = fn }
    observe(node) { observed.push(node) }
    disconnect() { observed.length = 0 }
  })
  const emit = (name, fields = {}) => listeners.get(name)?.({ target: element, composedPath: () => [element], ...fields })
  const scroll = value => { element.scrollTop = value; emit('scroll') }
  const grow = value => { element.scrollHeight += value; resize() }
  return { element, emit, scroll, grow, resize: () => resize(), observed, listeners, detach }
}

const f = feed()
assert.equal(f.element.scrollTop, 1600, 'opening completed history starts at the last response')
assert.deepEqual(f.observed, [f.element, f.element.firstElementChild])
f.grow(300)
assert.equal(f.element.scrollTop, 1900, 'live growth follows while reading at the end')
f.emit('wheel', { deltaY: -30, deltaX: 0 })
f.grow(100)
assert.equal(f.element.scrollTop, 1900, 'upward wheel intent suspends following before the scroll event')
f.scroll(500)
f.grow(100)
assert.equal(f.element.scrollTop, 500, 'history stays in place during refresh and growth')
f.scroll(f.element.scrollHeight - f.element.clientHeight - 25)
f.grow(100)
assert.equal(f.element.scrollTop, 2075, '25px from the end does not resume following')
f.scroll(f.element.scrollHeight - f.element.clientHeight - 24)
f.grow(100)
assert.equal(f.element.scrollTop, 2300, 'moving toward the source 24px boundary resumes following')
f.emit('keydown', { key: 'PageUp' })
f.grow(100)
assert.equal(f.element.scrollTop, 2300, 'keyboard navigation also suspends following')
f.detach()
assert.equal(f.listeners.size, 0)
assert.equal(f.observed.length, 0)

const nested = feed()
nested.emit('wheel', { deltaY: -50, deltaX: 0, composedPath: () => [{
  nodeType: 1, scrollTop: 40, scrollHeight: 500, clientHeight: 100,
  ownerDocument: { defaultView: { getComputedStyle: () => ({ overflowY: 'auto' }) } },
}, nested.element] })
nested.grow(200)
assert.equal(nested.element.scrollTop, 1800, 'scrolling inside an expanded command preserves the outer feed follow state')
nested.detach()

const racing = feed()
racing.element.scrollTop = 200
racing.grow(100)
racing.grow(100)
assert.equal(racing.element.scrollTop, 200, 'content growth cannot overwrite manual scrolling before its queued event arrives')
racing.detach()

const contracting = feed()
contracting.element.scrollHeight -= 100
// Chromium clamps scrollTop before delivering the resize and scroll events.
contracting.scroll(1600)
contracting.grow(200)
assert.equal(contracting.element.scrollTop, 1700, 'removing temporary content does not detach a viewport still at the end')
contracting.detach()

const rounding = feed()
rounding.element.scrollTop -= 0.5
rounding.grow(100)
assert.equal(rounding.element.scrollTop, 1700, 'fractional layout movement preserves following')
rounding.detach()

console.log('Verified initial child history, content growth, manual history, source boundary, nested commands and cleanup')
