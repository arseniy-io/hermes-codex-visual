import assert from 'node:assert/strict'
import test from 'node:test'
import { savedTurnCardAnchor, placeSavedTurnCard } from '../source/turn-card-anchor.js'

const turn = ({ assistants = [], response = null, live = false } = {}) => ({
  querySelector(selector) {
    return selector.includes('data-message-streaming') ? live ? {} : null
      : selector.includes('aui_response-group') ? response : null
  },
  querySelectorAll: () => assistants,
})

test('a stopped tool-only turn keeps its card without an assistant action footer', () => {
  const toolRoot = { querySelector: () => null, append(card) { card.parentElement = this } }
  const stopped = turn({ assistants: [toolRoot] })
  const card = {}
  assert.equal(savedTurnCardAnchor(stopped), toolRoot)
  placeSavedTurnCard(card, savedTurnCardAnchor(stopped))
  assert.equal(card.parentElement, toolRoot)
  // Repeated stop paint neither deletes the snapshot nor moves it elsewhere.
  placeSavedTurnCard(card, savedTurnCardAnchor(stopped))
  assert.equal(card.parentElement, toolRoot)
})

test('the card belongs to the last terminal root and stays before its normal actions', () => {
  const early = {}, footer = {}, anchor = {
    querySelector: () => footer,
    insertBefore(card, before) { assert.equal(before, footer); card.parentElement = this; card.nextSibling = footer },
  }
  footer.parentElement = anchor
  const group = turn({ assistants: [early, anchor] })
  const card = {}
  assert.equal(savedTurnCardAnchor(group), anchor)
  placeSavedTurnCard(card, anchor)
  assert.equal(card.nextSibling, footer)
})

test('a running turn uses its progress presentation and does not gain a terminal card', () => {
  assert.equal(savedTurnCardAnchor(turn({ live: true, assistants: [{}] })), null)
  const group = turn({ response: {} })
  assert.equal(savedTurnCardAnchor(group), group.querySelector('[data-slot="aui_response-group"]'))
})
