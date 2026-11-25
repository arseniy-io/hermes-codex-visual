import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const input = process.env.HCV_NATIVE_JOIN_FILE || new URL('../source/native-rendered-message.js', import.meta.url)
const body = fs.readFileSync(input, 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/export function /g, 'function ')
const record = new Function('committedFiber', body + '; return nativeRenderedMessageRecord')(() => null)
const atom = value => ({ get: () => value })
const fiber = (value, parent = null) => ({ dependencies: { firstContext: { memoizedValue: value } }, return: parent })
const node = id => ({ closest: () => id ? { getAttribute: () => id } : null })
const client = (id, scoped = true) => ({ message: Object.assign(() => ({
  __internal_getRuntime: () => ({ getState: () => ({ id }) })
}), scoped ? { source: {} } : {}) })
const view = messages => ({ $runtimeId: atom('runtime'), $storedId: atom('stored'), $messages: atom(messages) })

test('a saved user bubble keeps its exact DOM identity when an ancestor points at the newest reply', () => {
  const prompt = { id: 'prompt-renderer', rowId: 5, role: 'user' }
  const answer = { id: 'answer-renderer', rowId: 6, role: 'assistant' }
  const tree = fiber(client(prompt.id), fiber(client(answer.id), fiber(client('root-latest', false), fiber(view([prompt, answer])))))
  const actual = record(node(prompt.id), () => tree)
  assert.equal(actual?.rowId, 5)
  assert.equal(actual?.message, prompt)
  assert.equal(actual?.storedId, 'stored')
})

test('the canonical DOM identity cannot fall back to some other mounted message', () => {
  const prompt = { id: 'prompt-renderer', rowId: 5 }
  const tree = fiber(client(prompt.id), fiber(view([prompt])))
  assert.equal(record(node('unowned-dom-id'), () => tree), null)
})

test('a native wrapper without data-message-id accepts only one genuine message scope', () => {
  const event = { id: 'system-event', rowId: 19, role: 'system' }
  const tree = fiber(client(event.id), fiber(client('root-latest', false), fiber(view([event]))))
  assert.equal(record(node(null), () => tree)?.rowId, 19)
  assert.equal(record(node(null), () => fiber(client(event.id, false), fiber(view([event])))), null)
})

test('two message scopes without a native identity remain unproven', () => {
  const messages = [{ id: 'a', rowId: 1 }, { id: 'b', rowId: 2 }]
  assert.equal(record(node(null), () => fiber(client('a'), fiber(client('b'), fiber(view(messages))))), null)
})

test('a canonical message id still requires an unambiguous owning session and durable row', () => {
  const prompt = { id: 'prompt', rowId: 5 }
  const current = view([prompt])
  assert.equal(record(node('prompt'), () => fiber(current, fiber(view([prompt])))), null)
  assert.equal(record(node('prompt'), () => fiber(view([prompt, { ...prompt, rowId: 9 }]))), null)
})

test('AUI proxy accessors without actual owner ids cannot masquerade as a SessionView', () => {
  const prompt = { id: 'prompt', rowId: 5 }
  const proxy = new Proxy({ $messages: atom([prompt]) }, { get: (target, key) => target[key] || atom(undefined) })
  const actual = record(node(prompt.id), () => fiber(proxy, fiber(view([prompt]))))
  assert.equal(actual?.rowId, 5)
  assert.equal(actual?.runtimeId, 'runtime')
})

test('the selected transcript window preserves all exact per-part durable source ids', () => {
  const reply = { id: 'reply', rowId: 10, parts: [{ sourceRowId: 10 }, { sourceRowId: 14 }] }
  const actual = record(node(reply.id), () => fiber({ currentMessages: [reply] }, fiber(view([]))))
  assert.equal(actual?.rowId, 10)
  assert.deepEqual(actual?.sourceRowIds, [10, 14])
})
