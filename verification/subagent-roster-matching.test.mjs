import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { agentDisplayName, createAgentNameRegistry } from '../source/agent-display-name.js'
import { matchAgentReceipt } from '../source/agent-receipt-matching.js'

// Exercise the actual roster against test events and a synthetic Desktop DOM.
// Hermes owns the real cards; their React props are modelled at the boundary.
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const source = fs.readFileSync(new URL('../source/subagents.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export function /gm, 'function ')
const goal = 'Проверь отступы в ленте Hermes Desktop. Сравни поведение карточек и событий, исходные файлы не меняй.'
const ids = ['sa-0-bbbbbbbb', 'sa-1-aaaaaaaa']
const taskNames = ['source_map', 'results_review']
const agentPaths = ['/root/source_map', '/root/results_review']
const names = ['Source map', 'Results review']
const childSessions = ['20261120_103001_feed01', '20261120_103002_feed02']
const seed = index => JSON.stringify(['call-1', index])

function fixture({ initialRows = 2, nativeIds = [], withMetadata = true } = {}) {
  const row = `<div><div data-conversation-scaffold><span></span><button>${goal}</button></div></div>`
  const dom = new JSDOM(`<html lang="ru" data-test="yes"><body>
    <div data-chat-surface data-composer-target="main" data-session-anchor="workspace">
      <div data-slot="aui_thread-content"><div data-slot="aui_turn-pair">
        <div data-slot="aui_user-message-root" data-message-id="message-1"></div>
        <div data-slot="aui_response-group"><div data-delegate-card>${row.repeat(initialRows)}</div></div>
      </div></div>
    </div></body></html>`, { url: 'http://localhost/', runScripts: 'outside-only' })
  const { window } = dom
  const callbacks = new Map()
  const triggers = []
  let dispose
  let scheduled
  let frame = 0
  const raf = callback => { scheduled = callback; return ++frame }
  const flush = () => { const callback = scheduled; scheduled = null; callback?.() }
  const state = value => ({ get: () => value, subscribe: callback => { triggers.push(callback); return () => {} } })
  const host = { state: { activeSessionId: state('parent'), connectionId: state('local'), profile: state('default') } }
  const atom = initial => {
    let value = initial
    return { get: () => value, set: next => { value = next } }
  }
  const card = window.document.querySelector('[data-delegate-card]')
  const call = { toolCallId: 'call-1', args: { tasks: taskNames.map(task_name => ({ goal, ...(withMetadata ? { task_name } : {}) })) } }
  const committedFiber = element => element === card ? { return: { memoizedProps: call } }
    : { return: { memoizedProps: { row: { status: 'running', id: nativeIds[[...card.children].indexOf(element)] } } } }
  Object.assign(window, {
    agentDisplayName, createAgentNameRegistry, matchAgentReceipt, host, atom, committedFiber,
    requestAnimationFrame: raf, cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    mountStyle: () => {}, agentAvatars: [['<svg></svg>', '<svg></svg>']], codexMask: () => '',
    AgentPane: () => {}, agentPaneStyles: () => '', SummarySection: () => {},
    h: () => {}, useEffect: () => {}, useValue: () => {},
  })
  window.eval(source + '\nwindow.createTestRoster = registerSubagents')
  const ctx = { onEvent: (type, callback) => callbacks.set(type, callback), onDispose: callback => { dispose = callback } }
  const roster = window.createTestRoster(ctx, '[data-test="yes"]')
  flush()
  const emit = (type, index, payload = {}) => callbacks.get(type)({
    type, session_id: 'parent', timestamp: 1,
    payload: { subagent_id: ids[index], task_index: index, goal, child_session_id: childSessions[index],
      ...(withMetadata ? { task_name: taskNames[index], agent_path: agentPaths[index] } : {}), ...payload },
  })
  const finishDispatch = () => {
    call.result = { status: 'dispatched', goals: [goal, goal], subagent_ids: ids,
      ...(withMetadata ? { task_names: taskNames, agent_paths: agentPaths } : {}) }
    triggers[0]()
  }
  const addRow = () => card.append(card.firstElementChild.cloneNode(true))
  return { roster, emit, flush, finishDispatch, addRow, close: () => { dispose(); dom.window.close() } }
}

function assertResolved(roster) {
  const agents = roster.get().agents
  assert.equal(agents.length, 2, 'Two tasks must not become duplicate agents')
  assert.equal(new Set(agents.map(agent => agent.id)).size, 2)
  for (const [index, id] of ids.entries()) {
    assert.equal(agents.find(agent => agent.seed === seed(index))?.id, id)
    assert.equal(agents.find(agent => agent.id === id)?.displayName, names[index], 'Use the producer task name even when the goals are identical')
    assert.equal(agents.find(agent => agent.id === id)?.visualSeed, childSessions[index], 'Use the child conversation ID for the avatar')
  }
}

test('reversed starts with identical goals wait for the exact dispatch IDs', () => {
  const f = fixture()
  try {
    f.emit('subagent.start', 1)
    f.emit('subagent.start', 0)
    f.flush()
    const provisional = f.roster.get().agents
    assert.equal(provisional.find(agent => agent.seed === seed(0))?.id, seed(0))
    assert.equal(provisional.find(agent => agent.seed === seed(1))?.id, seed(1))
    f.emit('subagent.complete', 1, { status: 'failed', summary: 'Ошибка второго' })
    f.emit('subagent.complete', 0, { status: 'completed', summary: 'Ответ первого' })
    f.finishDispatch()
    f.flush()
    assertResolved(f.roster)
    const agents = f.roster.get().agents
    assert.equal(agents.find(agent => agent.id === ids[0]).summary, 'Ответ первого')
    assert.equal(agents.find(agent => agent.id === ids[1]).summary, 'Ошибка второго')
    assert.equal(agents.find(agent => agent.id === ids[0]).status, 'completed')
    assert.equal(agents.find(agent => agent.id === ids[1]).status, 'failed')
  } finally { f.close() }
})

test('a progress event and a late card may arrive in the same frame as exact IDs', () => {
  const f = fixture({ initialRows: 1 })
  try {
    f.emit('subagent.start', 1)
    f.flush()
    f.emit('subagent.progress', 1)
    f.addRow()
    f.finishDispatch()
    f.emit('subagent.start', 0)
    f.flush()
    assertResolved(f.roster)
    const names = new Map(f.roster.get().agents.map(agent => [agent.id, agent.displayName]))
    f.emit('subagent.complete', 0, { status: 'completed', summary: 'Ответ первого после связи' })
    f.emit('subagent.complete', 1, { status: 'failed', summary: 'Ошибка второго после связи' })
    f.flush()
    assertResolved(f.roster)
    const agents = f.roster.get().agents
    for (const agent of agents) assert.equal(agent.displayName, names.get(agent.id))
    assert.equal(agents.find(agent => agent.id === ids[0]).summary, 'Ответ первого после связи')
    assert.equal(agents.find(agent => agent.id === ids[1]).summary, 'Ошибка второго после связи')
    assert.equal(agents.find(agent => agent.id === ids[0]).status, 'completed')
    assert.equal(agents.find(agent => agent.id === ids[1]).status, 'failed')
  } finally { f.close() }
})

test('native rows matched by identical goal are not treated as exact IDs', () => {
  const f = fixture({ nativeIds: [ids[1], ids[0]] })
  try {
    f.emit('subagent.start', 1)
    f.emit('subagent.start', 0)
    f.flush()
    const provisional = f.roster.get().agents
    assert.equal(provisional.find(agent => agent.seed === seed(0))?.id, seed(0))
    assert.equal(provisional.find(agent => agent.seed === seed(1))?.id, seed(1))
    f.finishDispatch()
    f.flush()
    assertResolved(f.roster)
  } finally { f.close() }
})

test('old dispatches with goals alone retain the Codex fallback without deriving names or adding suffixes', () => {
  const f = fixture({ withMetadata: false })
  try {
    f.finishDispatch()
    f.flush()
    assert.deepEqual(Array.from(f.roster.get().agents, agent => agent.displayName), ['Субагент', 'Субагент'])
  } finally { f.close() }
})
