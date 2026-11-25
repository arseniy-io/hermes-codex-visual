import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { canonicalAgentReceipt } from '../source/agent-receipt-matching.js'

const body = (fs.readFileSync(new URL('../source/system-turn-notice-copy.js', import.meta.url), 'utf8') +
  fs.readFileSync(new URL('../source/system-turn-notices.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]*\n/gm, '').replace(/export (async )?function /g, '$1function ')
const load = new Function('nativeRenderedMessageRecord', 'nativeRenderedTextPart', 'nativeInterruptedDelegateActivity', 'canonicalAgentReceipt', 'document', 'MutationObserver',
  'requestAnimationFrame', 'cancelAnimationFrame', 'NodeFilter', 'Node', body + ';return registerSystemTurnNotices')
const failed = 'Your request was not processed. Send it again if you still want me to carry it out.'
const waiting = 'Operation interrupted: waiting for model response (402.4s elapsed).'

function harness() {
  const messages = [], records = new Map(), observers = [], frames = new Map(), historyListeners = new Set(), disposers = []
  const surface = {}, root = { lang: 'ru', active: true, matches() { return this.active } }
  const doc = { documentElement: root, body: {}, querySelectorAll: () => messages,
    createTreeWalker(element) { let at = 0; return { nextNode: () => element.texts[at++] } } }
  class MutationObserver { constructor(callback) { this.callback = callback; observers.push(this) } observe() {} disconnect() { this.disconnected = true } }
  let sequence = 0
  const schedule = callback => { const id = ++sequence; frames.set(id, callback); return id }
  const cancel = id => frames.delete(id)
  const events = new Map()
  const ctx = { onDispose: fn => disposers.push(fn), onEvent(type, fn) { events.set(type, fn) } }
  const data = { scope: JSON.stringify(['local', 'default', 'runtime']), sessionId: 'stored', rows: [], receipts: [] }
  const history = { forSurface: () => data, subscribe(fn) { historyListeners.add(fn); return () => historyListeners.delete(fn) } }
  const add = (message, leaves = message.parts.map(part => part.text)) => {
    const markers = new Set()
    const element = { dataset: { role: message.role }, closest: () => surface, markers,
      setAttribute: key => markers.add(key), removeAttribute: key => markers.delete(key) }
    element.texts = leaves.map(data => ({ data, isConnected: true }))
    messages.push(element)
    records.set(element, { rowId: messages.length, runtimeId: 'runtime', storedId: 'stored', message })
    return element
  }
  const register = load(element => records.get(element), element => element?.part || null, () => null, canonicalAgentReceipt, doc, MutationObserver, schedule, cancel,
    { SHOW_TEXT: 4 }, { ELEMENT_NODE: 1 })
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()) }
  const changed = () => { observers[1].callback([]); flush() }
  return { add, data, root, messages, records, observers, frames, historyListeners,
    emit(type, event) { events.get(type)?.(event); flush() },
    start: () => register(ctx, 'active', history), changed, flush,
    dispose: () => disposers.forEach(dispose => dispose()) }
}

test('native projected system and interrupted diagnostic translate, while model quotations stay verbatim', () => {
  const h = harness()
  const system = h.add({ role: 'system', parts: [{ type: 'text', text: failed }] })
  const diagnostic = h.add({ role: 'assistant', interrupted: true, parts: [{ type: 'text', text: waiting }] })
  const quoted = h.add({ role: 'assistant', interrupted: true,
    parts: [{ type: 'text', text: 'Quoted diagnostic: ' + waiting }] }, [waiting])
  h.start()
  assert.match(system.texts[0].data, /^Запрос не был обработан\./)
  assert.match(diagnostic.texts[0].data, /402,4 с/)
  assert.equal(quoted.texts[0].data, waiting)
})

test('language/theme changes and plugin disposal restore original nodes and remove subscriptions', () => {
  const h = harness()
  const system = h.add({ role: 'system', parts: [{ type: 'text', text: failed }] })
  h.start()
  h.root.lang = 'en'; h.changed()
  assert.equal(system.texts[0].data, failed)
  h.root.lang = 'ru'; h.changed()
  assert.match(system.texts[0].data, /^Запрос не был обработан\./)
  h.root.active = false; h.changed()
  assert.equal(system.texts[0].data, failed)
  h.root.active = true; h.changed()
  h.dispose()
  assert.equal(system.texts[0].data, failed)
  assert.equal(h.historyListeners.size, 0)
  assert.equal(h.frames.size, 0)
  assert(h.observers.every(observer => observer.disconnected))
})

test('an async child report requires canonical interrupted status under that same native owner', () => {
  const h = harness()
  const child = h.add({ role: 'system', parts: [{ type: 'text', text: '1 background agent finished' }], asyncResult: failed },
    ['1 background agent finished', failed])
  h.data.receipts = [{ row_id: 1, delegation_id: 'delegation-1', agents: [{ subagent_id: 'worker-1', status: 'completed' }] }]
  h.start()
  assert.equal(child.texts[1].data, failed)
  h.data.receipts[0].agents[0].status = 'interrupted'; h.changed()
  assert.match(child.texts[1].data, /^Запрос не был обработан\./)
  h.records.get(child).runtimeId = 'other-runtime'; h.changed()
  assert.equal(child.texts[1].data, failed)
})

test('a native terminal part in a merged bubble translates without changing an earlier quoted part', () => {
  const h = harness()
  const quote = { type: 'text', text: waiting, sourceRowId: 10 }
  const terminal = { type: 'text', text: waiting, sourceRowId: 15 }
  const bubble = h.add({ role: 'assistant', interrupted: true, parts: [quote, terminal] })
  bubble.texts.forEach((text, index) => { text.parentElement = { part: index ? terminal : quote } })
  h.data.rows = [{ id: 10, role: 'assistant', content: waiting },
    { id: 15, role: 'assistant', content: waiting, display_metadata: '{"interrupted":true}' }]
  h.start()
  assert.equal(bubble.texts[0].data, waiting)
  assert.match(bubble.texts[1].data, /402,4 с/)
  h.data.rows[1].content = 'another original row'; h.changed()
  assert.equal(bubble.texts[1].data, waiting)
  delete h.data.rows[1].content; h.changed()
  assert.match(bubble.texts[1].data, /402,4 с/)
})

test('a projected recovery line is marked only when the stored row already declared the failure boundary', () => {
  const h = harness()
  const notice = h.add({ role: 'system', parts: [{ type: 'text', text: failed }] })
  const quote = h.add({ role: 'system', parts: [{ type: 'text', text: failed }] })
  h.data.rows = [{ id: 1, role: 'assistant', display_kind: 'failed_turn', isStoredFailedTurn: true },
    { id: 2, role: 'assistant', display_kind: 'failed_turn' }]
  h.start()
  assert.equal(notice.markers.has('data-hcv-stop-diagnostic'), true)
  assert.equal(quote.markers.has('data-hcv-stop-diagnostic'), false)
  h.dispose()
  assert.equal(notice.markers.size, 0)
})

test('only the typed terminal diagnostic is marked for hiding, in either language', () => {
  const h = harness()
  const quoted = { type: 'text', text: waiting, sourceRowId: 10 }
  const diagnostic = { type: 'text', text: waiting, sourceRowId: 15 }
  const bubble = h.add({ role: 'assistant', interrupted: true, parts: [quoted, diagnostic] })
  bubble.contains = block => bubble.texts.some(text => text.parentElement === block)
  bubble.texts.forEach((text, index) => {
    const markers = new Set()
    text.parentElement = {
      part: index ? diagnostic : quoted, markers, closest() { return this },
      get textContent() { return text.data },
      setAttribute: key => markers.add(key), removeAttribute: key => markers.delete(key),
    }
  })
  h.data.rows = [{ id: 10, role: 'assistant' },
    { id: 15, role: 'assistant', display_metadata: { interrupted: true } }]
  h.start()
  const marker = 'data-hcv-stop-diagnostic'
  assert.equal(bubble.texts[0].parentElement.markers.has(marker), false)
  assert.equal(bubble.texts[1].parentElement.markers.has(marker), true)
  h.root.lang = 'en'
  h.changed()
  assert.equal(bubble.texts[1].data, waiting)
  assert.equal(bubble.texts[1].parentElement.markers.has(marker), true)
  h.dispose()
  assert.equal(bubble.texts[1].parentElement.markers.has(marker), false)
})

test('a live interrupted completion translates its own terminal part before history hydration', () => {
  const h = harness()
  const narration = { type: 'text', text: 'Earlier model narration' }
  const terminal = { type: 'text', text: waiting }
  const receipt = { row_ids: [9, 10, 11], user_row_id: 9, submission_id: 'native-submission' }
  const bubble = h.add({ role: 'assistant', pending: false, parts: [narration, terminal], persistedTurn: receipt })
  h.records.get(bubble).rowId = null
  bubble.texts.forEach((text, index) => { text.parentElement = { part: index ? terminal : narration } })
  const event = { connectionId: 'local', profile: 'default', session_id: 'runtime',
    payload: { status: 'interrupted', text: waiting, persisted_turn: receipt } }
  h.start()
  assert.equal(bubble.texts[1].data, waiting)
  for (const wrong of [
    { ...event, profile: 'other' }, { ...event, connectionId: 'other' },
    { ...event, session_id: 'other' },
    { ...event, payload: { ...event.payload, status: 'complete' } },
    { ...event, payload: { ...event.payload, persisted_turn: { ...receipt, submission_id: 'other' } } },
    { ...event, payload: { ...event.payload, persisted_turn: { ...receipt, row_ids: [9, 10, 12] } } },
    { ...event, payload: { ...event.payload, text: 'Different reply' } },
  ]) {
    h.emit('message.complete', wrong)
    assert.equal(bubble.texts[1].data, waiting)
  }
  h.emit('message.complete', event)
  assert.equal(bubble.texts[0].data, narration.text)
  assert.match(bubble.texts[1].data, /402,4 с/)
  assert.equal(terminal.text, waiting, 'Native message and clipboard payload remain original')
  h.records.get(bubble).message.persistedTurn = { ...receipt, submission_id: 'new-turn' }
  h.changed()
  assert.equal(bubble.texts[1].data, waiting)
  h.dispose()
})
