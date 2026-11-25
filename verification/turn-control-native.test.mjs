import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeBubbleStop } from '../source/turn-control-native.js'

const props = { showStop: true, showRestore: false, touch: false, fullText: 'Task', messageId: 'native-id', onCancel() {} }
function fixture(value = props) {
  const message = {}, end = { stateNode: message, return: null }
  const button = { matches: () => true, closest: () => message }
  return { button, read: () => ({ memoizedProps: value, return: end }) }
}
test('only the native running user-bubble action is a full task Stop', () => {
  const f = fixture()
  assert(nativeBubbleStop(f.button, f.read))
  for (const replacement of [{ showStop: false }, { onCancel: null }, { fullText: null }, { showRestore: undefined }]) {
    const other = fixture({ ...props, ...replacement })
    assert.equal(nativeBubbleStop(other.button, other.read), false)
  }
})
test('translated labels, restore and unrelated buttons never imply cancellation', () => {
  const f = fixture({ 'aria-label': 'Стоп', onClick() {} })
  assert.equal(nativeBubbleStop(f.button, f.read), false)
  f.button.matches = () => false
  assert.equal(nativeBubbleStop(f.button, () => ({ memoizedProps: props })), false)
  f.button.matches = () => true
  f.button.closest = () => null
  assert.equal(nativeBubbleStop(f.button, () => ({ memoizedProps: props })), false)
})
test('a component beyond the owning native message cannot authorize a Stop', () => {
  const f = fixture()
  const message = f.button.closest()
  assert.equal(nativeBubbleStop(f.button, () => ({ stateNode: message, return: { memoizedProps: props } })), false)
})
