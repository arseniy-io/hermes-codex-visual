import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { matchAgentReceipt } from '../source/agent-receipt-matching.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')

test('a stored completion matches only one earlier card in the same conversation', () => {
  const dom = new JSDOM(`<div data-slot="aui_thread-content">
    <div id="first"></div><div id="second"></div><div id="notice"></div><div id="later"></div>
  </div><div data-slot="aui_thread-content"><div id="other"></div></div>`)
  try {
    const byId = id => dom.window.document.getElementById(id)
    const candidate = goal => [{ goal, status: 'dispatched' }]
    const target = byId('notice')
    const heading = 'Subagent Task Completed: Проверить файл'
    const first = candidate('Проверить файл')
    const cards = new Map([[byId('first'), first]])
    assert.deepEqual(matchAgentReceipt(target, heading, cards), { outcome: 'Completed', count: 1, entries: first })
    cards.set(byId('second'), candidate('Проверить файл'))
    assert.equal(matchAgentReceipt(target, heading, cards), null, 'two equal requests are ambiguous')
    cards.delete(byId('second'))
    cards.set(byId('other'), candidate('Проверить файл'))
    cards.set(byId('later'), candidate('Проверить файл'))
    assert.equal(matchAgentReceipt(target, heading, cards)?.entries, first, 'other chats and later cards do not match')
    assert.equal(matchAgentReceipt(target, 'Subagent Task Completed: Другая задача', cards), null)
    assert.equal(matchAgentReceipt(target, 'Subagent Task Unknown: Проверить файл', cards), null)
  } finally {
    dom.window.close()
  }
})

test('a batch receipt requires exact task count and goals', () => {
  const dom = new JSDOM('<div data-slot="aui_thread-content"><div id="card"></div><div id="notice"></div></div>')
  try {
    const card = dom.window.document.getElementById('card')
    const target = dom.window.document.getElementById('notice')
    const entries = [{ goal: 'Первое', status: 'dispatched' }, { goal: 'Второе', status: 'dispatched' }]
    const cards = new Map([[card, entries]])
    assert.equal(matchAgentReceipt(target, 'Subagent Tasks Completed: Первое; Второе (2 tasks)', cards)?.entries, entries)
    assert.equal(matchAgentReceipt(target, 'Subagent Tasks Completed: Первое; Второе (3 tasks)', cards), null)
    assert.equal(matchAgentReceipt(target, 'Subagent Tasks Completed: Первое; Второе', cards), null)
  } finally {
    dom.window.close()
  }
})

test('terminal outcomes must agree, and duplicate or conflicting receipts stay separate', () => {
  const dom = new JSDOM(`<div data-slot="aui_thread-content">
    <div id="card"></div><div id="notice"></div><div id="again"></div>
  </div>`)
  try {
    const byId = id => dom.window.document.getElementById(id)
    const entries = [{ goal: 'Проверка', status: 'completed' }]
    const cards = new Map([[byId('card'), entries]])
    const target = byId('notice')
    const done = 'Subagent Task Completed: Проверка'
    assert.equal(matchAgentReceipt(target, done, cards)?.entries, entries)
    assert.equal(matchAgentReceipt(target, 'Subagent Task Failed: Проверка', cards), null)
    entries[0].status = 'failed'
    assert.equal(matchAgentReceipt(target, done, cards), null)
    assert.equal(matchAgentReceipt(target, 'Subagent Task Failed: Проверка', cards)?.entries, entries)
    entries[0].status = 'interrupted'
    assert.equal(matchAgentReceipt(target, 'Subagent Task Cancelled: Проверка', cards)?.entries, entries)
    entries[0].status = 'running'
    assert.equal(matchAgentReceipt(target, done, cards), null)
    entries[0].status = 'completed'
    assert.equal(matchAgentReceipt(target, done, cards, [[target, done], [byId('again'), done]]), null)
    assert.equal(matchAgentReceipt(target, done, cards,
      [[target, done], [byId('again'), 'Subagent Task Failed: Проверка']]), null)
  } finally {
    dom.window.close()
  }
})
