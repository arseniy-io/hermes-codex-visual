import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const turnFile = process.env.HCV_STREAM_TEST_SOURCE || new URL('../source/turns.js', import.meta.url)
const file = fs.readFileSync(turnFile, 'utf8')
const source = file.slice(file.indexOf('const response ='))
  .replace('export function registerTurnExperience', 'function registerTurnExperience')
  .replace(/^import .*$/gm, '')

const response = '[data-slot="aui_response-group"]'
const native = ':is([data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"])'
const working = '[data-message-streaming="true"], ' + native
const notice = '<div data-slot="aui_assistant-message-stopped">Paused</div>'

function turn(id, row, content, footer = '') {
  return `<div data-slot="aui_turn-pair" id="${id}">
    <div data-slot="aui_user-message-root" data-message-id="${id}"></div>
    <div data-slot="aui_response-group">
      <div data-slot="aui_assistant-message-root" data-row="${row}">
        <div data-slot="aui_assistant-message-content">${content}</div>${footer}
      </div>
    </div>
  </div>`
}

function surface(target, session, html) {
  return `<div data-chat-surface data-composer-target="${target}" data-session="${session}">
    <div data-slot="aui_thread-content">${html}</div>
  </div>`
}

function sample() {
  const dom = new JSDOM('<html data-theme="fixture" lang="en"><body>' +
    surface('main', 'one', turn('main-before', 11, '<p>Before</p>') + turn('main-stopped', 12, notice) +
      turn('main-live', 13, '<p>Current answer</p>', '<span data-message-streaming="true"></span>')) +
    surface('tile:2', 'two', turn('tile-stopped', 21, notice) + turn('tile-last', 22, '<p>Last tile answer</p>')) +
    '</body></html>', { runScripts: 'outside-only', pretendToBeVisual: true })
  const { window } = dom
  const { document } = window
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  const historyListeners = new Set()
  const stopListeners = new Set()
  const disposers = []
  const snapshots = new Map()
  const requestedStops = new Map()
  const deliveries = []
  const frames = new Map()
  let frameId = 0
  const atom = { get: () => null, listen: () => () => {} }
  window.host = { state: new Proxy({}, { get: () => atom }) }
  window.registerTurnFilePreviewStyle = () => {}
  window.mountCSS = () => {}
  window.chatStyles = {}
  window.committedFiber = () => null
  window.syncWorkSteps = (_group, state, steps) => { state.steps = new Set(steps) }
  window.nativeRenderedMessageRecord = node => ({
    rowId: Number(node.dataset.row), storedId: node.closest('[data-session]').dataset.session, sourceRowIds: [],
  })
  window.elapsedTurnSeconds = (start, last) => Math.floor((last - start) / 1000)
  window.savedTimelineMetadata = row => row?.timing
  window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId }
  window.cancelAnimationFrame = id => frames.delete(id)
  window.eval(source + '\nglobalThis.registerFixture = registerTurnExperience')

  const subscribe = listeners => listener => { listeners.add(listener); return () => listeners.delete(listener) }
  const ctx = { onEvent() {}, onDispose: dispose => disposers.push(dispose) }
  const stopHistory = { forSurface: surface => prompt => requestedStops.get(surface.dataset.session)?.get(prompt),
    subscribe: subscribe(stopListeners) }
  const turnTimeline = { forSurface: surface => snapshots.get(surface.dataset.session), subscribe: subscribe(historyListeners) }

  const query = window.Element.prototype.querySelector
  window.Element.prototype.querySelector = function(selector) {
    const found = query.apply(this, arguments)
    if (selector === working && this.matches(response)) deliveries.push(this.parentElement.id)
    return found
  }
  async function paint() {
    await Promise.resolve()
    for (let i = 0; frames.size && i < 8; i++) {
      const pending = [...frames.values()]
      frames.clear()
      for (const frame of pending) frame()
      await Promise.resolve()
    }
    assert.equal(frames.size, 0)
  }

  window.registerFixture(ctx, '[data-theme="fixture"]', stopHistory, turnTimeline)
  return {
    document, deliveries, paint, requestedStops,
    update(session, rows) {
      snapshots.set(session, { requestedSessionId: session, rows })
      for (const listener of historyListeners) listener()
    },
    close() { disposers.forEach(dispose => dispose()); window.close() },
  }
}

function timelineRow(id, seconds) {
  return { id, role: 'assistant', display_metadata: { interrupted: true },
    timing: { turnStartedAtMs: 1000, completedAtMs: 1000 + seconds * 1000 } }
}

test('a timeline refresh supplies the stop time without replaying the other answers', async () => {
  const fixture = sample()
  try {
    await fixture.paint()
    assert.equal(fixture.deliveries.length, 5)
    const live = fixture.document.querySelector('#main-live [data-hcv-live-turn]')
    assert(live)
    const mainTime = fixture.document.querySelector('#main-stopped [data-hcv-turn-stop-line] time')
    const tileTime = fixture.document.querySelector('#tile-stopped [data-hcv-turn-stop-line] time')
    assert(mainTime.hidden && tileTime.hidden)
    fixture.deliveries.length = 0

    fixture.update('one', [timelineRow(12, 7)])
    fixture.update('two', [timelineRow(21, 15)])
    await fixture.paint()
    assert.equal(mainTime.dateTime, 'PT7S')
    assert.equal(tileTime.dateTime, 'PT15S')
    assert(!mainTime.hidden && !tileTime.hidden)
    assert.equal(fixture.document.querySelector('#main-live [data-hcv-live-turn]'), live)
    assert.deepEqual(fixture.deliveries, [])

    const reply = fixture.document.querySelector('#main-live [data-slot="aui_assistant-message-content"]')
    const delta = fixture.document.createElement('p')
    delta.textContent = 'Next chunk'
    reply.append(delta)
    fixture.requestedStops.set('two', new Map([['tile-last', { seconds: 9 }]]))
    fixture.update('two', [timelineRow(21, 15)])
    await fixture.paint()
    assert.equal(fixture.document.querySelector('#tile-last').getAttribute('data-hcv-turn-stopped'), 'user')
    assert.equal(fixture.document.querySelector('#tile-last [data-hcv-turn-stop-line] time').dateTime, 'PT9S')
    assert.equal(fixture.document.querySelector('#main-live [data-hcv-live-turn]'), live)
    assert.deepEqual(fixture.deliveries.sort(), ['main-live', 'tile-last'])
  } finally {
    fixture.close()
  }
})
