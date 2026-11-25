import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8')
const body = read('../source/native-rendered-message.js').replace(/^import[^\n]*\n/gm, '').replace(/export function /g, 'function ')
const nativeRenderedMessageRecord = new Function('committedFiber', body + ';return nativeRenderedMessageRecord')(() => null)
const canonBody = read('../source/agent-receipt-matching.js').replace(/export function /g, 'function ')
const canonicalAgentReceipt = new Function(canonBody + ';return canonicalAgentReceipt')()
const atom = value => ({ get: () => value })
const node = { closest: () => null }
const fiber = (value, parent = null) => ({ dependencies: { firstContext: { memoizedValue: value } }, return: parent })

test('system renderer identity joins the actual durable source message, not its timestamp or position', () => {
  const actual = { id: 'renderer-1', rowId: 1219, role: 'system', parts: [] }
  const view = { $runtimeId: atom('owner-runtime'), $storedId: atom('owner-stored'),
    $messages: atom([{ id: 'renderer-2', rowId: 999, timestamp: 1000 }, actual]) }
  const client = { message: Object.assign(() => ({ __internal_getRuntime: () => ({ getState: () => ({ id: 'renderer-1' }) }) }), { source: {} }) }
  const result = nativeRenderedMessageRecord(node, () => fiber(client, fiber(view)))
  assert.equal(result.rowId, 1219)
  assert.equal(result.message, actual)
  assert.equal(result.runtimeId, 'owner-runtime')
})

test('the selected historical transcript retains its exact row and per-part source ids', () => {
  const actual = { id: 'history-1', rowId: 20, role: 'assistant', parts: [{ sourceRowId: 21 }, { sourceRowId: 22 }] }
  const view = { $runtimeId: atom('owner'), $storedId: atom('stored'), $messages: atom([]) }
  const client = { message: Object.assign(() => ({ __internal_getRuntime: () => ({ getState: () => ({ id: 'history-1' }) }) }), { source: {} }) }
  const result = nativeRenderedMessageRecord(node, () => fiber(client, fiber({ currentMessages: [actual] }, fiber(view))))
  assert.equal(result.rowId, 20)
  assert.deepEqual(result.sourceRowIds, [21, 22])
})

test('ambiguous message or owner scopes never supply a row identity', () => {
  const actual = { id: 'renderer', rowId: 1 }
  const view = { $runtimeId: atom('parent'), $storedId: atom('stored'), $messages: atom([actual]) }
  const other = { $runtimeId: atom('other'), $storedId: atom('foreign'), $messages: atom([actual]) }
  const client = { message: Object.assign(() => ({ __internal_getRuntime: () => ({ getState: () => ({ id: 'renderer' }) }) }), { source: {} }) }
  assert.equal(nativeRenderedMessageRecord(node, () => fiber(client, fiber(view, fiber(other)))), null)
  assert.equal(nativeRenderedMessageRecord(node, () => fiber(view)), null)
  assert.equal(nativeRenderedMessageRecord(node, () => fiber(client, fiber({ ...view, $messages: atom([]) }))), null)
})

test('receipt projection matches only its durable row and rejects duplicate row or worker identities', () => {
  const receipt = { row_id: 1219, delegation_id: 'deleg_saved',
    agents: [{ subagent_id: 'sa-real', child_session_id: 'child-real', task_index: 0, status: 'completed' }] }
  assert.equal(canonicalAgentReceipt(1219, [receipt]), receipt)
  assert.equal(canonicalAgentReceipt(1220, [receipt]), null)
  assert.equal(canonicalAgentReceipt(1219, [receipt, receipt]), null)
  assert.equal(canonicalAgentReceipt(1219, [{ ...receipt, agents: [receipt.agents[0], receipt.agents[0]] }]), null)
  assert.equal(canonicalAgentReceipt(1219, [{ ...receipt, agents: [{ ...receipt.agents[0], status: 'unknown' }] }]), null)
})
