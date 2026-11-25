import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { anchorTurnCard } from '../source/turn-card-scroll.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const cardSource = fs.readFileSync(new URL('../source/turn-changes-card.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')
const domSource = fs.readFileSync(new URL('../source/turn-changes-dom.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')
const { TurnChangesCard, turnChangesTitle, syncTurnChangesSpinner, canReconcileTurnChange } = new Function('h', 'useState', 'useEffect', 'useRef', 'codexMask',
  cardSource + '\nreturn { TurnChangesCard, turnChangesTitle, syncTurnChangesSpinner, canReconcileTurnChange }')(React.createElement, React.useState, React.useEffect, React.useRef, () => '')
function snapshot(count = 4) {
  return { turnId: 'user-row', snapshotId: 'fixture-snapshot', scope: 'fixture-owner', revision: 0, nextAction: 'undo', status: 'ready', canApply: true,
    files: Array.from({ length: count }, (_, index) => ({ path: `folder/sub/file-${index}.txt`, added: index + 1, removed: index })) }
}
function fixture(props = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="native-message"></div>', { runScripts: 'outside-only' })
  dom.window.turnChangesTitle = turnChangesTitle
  dom.window.syncTurnChangesSpinner = syncTurnChangesSpinner
  dom.window.canReconcileTurnChange = canReconcileTurnChange
  dom.window.anchorTurnCard = anchorTurnCard
  dom.window.eval(domSource + '\nwindow.create = createTurnChangesCard')
  const config = { snapshot: snapshot(), lang: 'ru', onReview() {}, onApply() {}, ...props }
  const card = dom.window.create(config)
  dom.window.document.querySelector('#native-message').append(card.element)
  return { ...card, config, window: dom.window, document: dom.window.document, close() { card.dispose(); dom.window.close() } }
}

test('main DOM and child React source-derived cards have the same markup for one and four files', () => {
  for (const count of [1, 4]) {
    const f = fixture({ snapshot: snapshot(count) })
    try {
      const actual = f.element.cloneNode(true)
      actual.removeAttribute('data-hcv-generated')
      const expected = new JSDOM(renderToStaticMarkup(React.createElement(TurnChangesCard, f.config))).window.document.body.firstElementChild
      assert.equal(actual.outerHTML, expected.outerHTML)
      assert.match(actual.textContent, count === 1 ? /Изменён file-0.txt/ : /Изменено 4 файла/)
    } finally { f.close() }
  }
})

test('three rows default, exact more/collapse locale and independently owning review path', () => {
  const opens = []
  const f = fixture({ onReview: (snapshot, file) => opens.push([snapshot.snapshotId, file]) })
  try {
    assert.equal(f.element.querySelectorAll('[data-hcv-turn-card-file]').length, 3)
    const more = f.element.querySelector('[data-hcv-turn-card-more]')
    assert.equal(more.textContent, 'Показать еще 1 файл')
    more.click()
    assert.equal(f.element.querySelectorAll('[data-hcv-turn-card-file]').length, 4)
    assert.equal(more.textContent, 'Свернуть файлы')
    f.element.querySelectorAll('[data-hcv-turn-card-file]')[3].click()
    f.element.querySelector('[data-hcv-turn-card-review]').click()
    assert.deepEqual(opens, [['fixture-snapshot', 'folder/sub/file-3.txt'], ['fixture-snapshot', undefined]])
    more.click()
    assert.equal(f.element.querySelectorAll('[data-hcv-turn-card-file]').length, 3)
  } finally { f.close() }
})

test('real async action is single submission, changes revision and switches to Reapply', async () => {
  let resolve
  const requests = []
  const f = fixture({ onApply: (snapshot, action) => {
    requests.push([snapshot.snapshotId, snapshot.revision, action])
    return new Promise(done => { resolve = done })
  } })
  try {
    const button = f.element.querySelector('[data-hcv-turn-card-apply]')
    button.click()
    button.click()
    assert.equal(requests.length, 1)
    assert.equal(button.disabled, true)
    resolve({ status: 'success', revision: 1, nextAction: 'reapply' })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(button.textContent, 'Повторно применить')
    assert.equal(button.disabled, false)
    button.click()
    assert.deepEqual(requests, [['fixture-snapshot', 0, 'undo'], ['fixture-snapshot', 1, 'reapply']])
    resolve({ status: 'success', revision: 2, nextAction: 'undo' })
    await new Promise(resolve => setTimeout(resolve, 0))
  } finally { f.close() }
})

test('an uncertain POST stays fenced, and a disposed or foreign owner receives no late result', async () => {
  const f = fixture({ onApply: async () => { throw new Error('timeout') } })
  try {
    f.element.querySelector('[data-hcv-turn-card-apply]').click()
    await Promise.resolve(); await Promise.resolve()
    assert.equal(f.element.querySelector('[data-hcv-turn-card-apply]').disabled, true)
  } finally { f.close() }
  let owner = true, resolve, reports = 0
  const g = fixture({ sameOwner: () => owner, onApply: () => new Promise(done => { resolve = done }), onResult: () => reports++ })
  g.element.querySelector('[data-hcv-turn-card-apply]').click()
  owner = false
  g.dispose()
  resolve({ status: 'success', revision: 1, nextAction: 'reapply' })
  await Promise.resolve(); await Promise.resolve()
  assert.equal(reports, 0)
  assert.equal(g.element.isConnected, false)
  g.close()
})

test('stable updates cause no DOM mutations or focus loss', async () => {
  const f = fixture()
  try {
    const button = f.element.querySelector('[data-hcv-turn-card-review]')
    button.focus()
    const changes = []
    const observer = new f.window.MutationObserver(records => changes.push(...records))
    observer.observe(f.element, { attributes: true, characterData: true, childList: true, subtree: true })
    for (let i = 0; i < 100; i++) f.update({ ...f.config })
    await Promise.resolve()
    assert.equal(changes.length, 0)
    assert.equal(f.document.activeElement, button)
    observer.disconnect()
  } finally { f.close() }
})

test('Undo recovers from a lost request after a fresh ready snapshot at the same revision', async () => {
  const f = fixture({ onApply: async () => { throw new Error('request not delivered') } })
  try {
    const button = f.element.querySelector('[data-hcv-turn-card-apply]')
    button.click()
    await new Promise(resolve => setImmediate(resolve))
    f.update({ ...f.config })
    assert.equal(button.disabled, true, 'a repaint of the old snapshot cannot settle the request')
    f.update({ ...f.config, snapshot: { ...f.config.snapshot, status: 'inflight' } })
    assert.equal(button.disabled, true, 'the pending backend operation must finish first')
    f.update({ ...f.config, snapshot: { ...f.config.snapshot } })
    assert.equal(button.disabled, false)
  } finally { f.close() }
})
