import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

import { agentDisplayName, createAgentNameRegistry } from '../source/agent-display-name.js'
import { matchAgentReceipt } from '../source/agent-receipt-matching.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const source = fs.readFileSync(new URL('../source/subagents.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')
const avatars = JSON.parse(fs.readFileSync(new URL('../source/visual-assets.json', import.meta.url), 'utf8')).avatars
const goal = 'Проверь правила. Найди противоречия, исходные файлы не меняй.'
const id = 'fixture-method-reviewer'
const childSession = '20261120_103001_ded001'
const metadata = { task_name: 'agent_names', agent_path: '/root/agent_names', child_session_id: childSession }

function message(document, messageId, text) {
  const root = document.createElement('div')
  root.dataset.slot = 'aui_assistant-message-root'
  root.dataset.messageId = messageId
  const body = document.createElement('div')
  body.dataset.slot = 'aui_assistant-message-content'
  if (text) {
    const paragraph = document.createElement('div')
    paragraph.className = 'aui-md'
    paragraph.textContent = text
    body.append(paragraph)
  }
  root.append(body)
  return { root, body }
}

function fixture(configure = () => {}) {
  const dom = new JSDOM(`<html lang="ru" data-test="yes" data-hermes-mode="dark"><head></head><body>
    <div data-chat-surface data-composer-target="main" data-session-anchor="workspace">
      <div data-slot="aui_thread-content"><div data-slot="aui_turn-pair">
        <div data-slot="aui_user-message-root" data-message-id="prompt-1"></div>
        <div data-slot="aui_response-group"></div>
      </div></div>
    </div></body></html>`, { url: 'http://localhost/', runScripts: 'outside-only' })
  const { window } = dom
  const { document } = window
  const response = document.querySelector('[data-slot="aui_response-group"]')
  const durable = message(document, 'assistant-durable', 'Проверка правил продолжается.')
  const loading = message(document, 'assistant-loading')
  loading.body.innerHTML = '<div data-slot="aui_turn-activity" data-state="active">Идёт работа</div>'
  response.append(durable.root, loading.root)
  const fibers = new Map()
  configure({ document, response, durable, loading, fibers })
  const callbacks = new Map()
  const scheduled = new Map()
  let nextFrame = 0
  let sequence = 0
  let dispose
  const state = value => ({ get: () => value, subscribe: () => () => {} })
  const host = { state: { activeSessionId: state('parent'), connectionId: state('local'), profile: state('default') },
    request: async () => ({ subagents: [] }) }
  const atom = initial => {
    let value = initial
    return { get: () => value, set: next => { value = next } }
  }
  Object.assign(window, {
    agentDisplayName, createAgentNameRegistry, matchAgentReceipt, host, atom,
    committedFiber: element => fibers.has(element) ? { return: { memoizedProps: fibers.get(element) } } : null,
    requestAnimationFrame: callback => { scheduled.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame: frame => scheduled.delete(frame),
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    mountStyle: (_ctx, sheet) => document.head.append(sheet), agentAvatars: avatars, codexMask: () => '',
    AgentPane: () => {}, agentPaneStyles: () => '', SummarySection: () => {},
    h: () => {}, useEffect: () => {}, useValue: () => {},
  })
  window.eval(source + '\nwindow.createTestRoster = registerSubagents')
  const ctx = { onEvent: (type, callback) => callbacks.set(type, callback), onDispose: callback => { dispose = callback } }
  const roster = window.createTestRoster(ctx, '[data-test="yes"]')
  const flush = async () => {
    for (let pass = 0; pass < 12; pass++) {
      // Allow the real MutationObserver to notice native DOM removal/remount.
      await new Promise(resolve => window.setTimeout(resolve, 0))
      if (!scheduled.size) return
      const work = [...scheduled.values()]
      scheduled.clear()
      for (const callback of work) callback()
    }
    assert.fail('Subagent reconciliation did not settle')
  }
  const emit = (type, payload = {}) => callbacks.get(type)({
    type, session_id: 'parent', seq: ++sequence, timestamp: sequence,
    payload: { subagent_id: id, goal, ...metadata, ...payload },
  })
  return { document, response, durable, loading, roster, emit, flush,
    close: () => { dispose(); dom.window.close() } }
}

test('real lifecycle rows survive removing a temporary loading root and remounting durable message content', async () => {
  const f = fixture()
  try {
    await f.flush()
    f.emit('subagent.start')
    await f.flush()
    const started = f.document.querySelector('[data-hcv-agent-activity="started"]')
    assert(started)
    assert.equal(started.textContent, 'Agent names начал(-и) работу')
    assert.equal(started.closest('[data-slot="aui_assistant-message-content"]'), f.durable.body)
    assert.equal(f.loading.root.querySelector('[data-hcv-agent-rows]'), null, 'Loading placeholders cannot own a lifecycle event')
    const src = started.querySelector('img').getAttribute('src')
    assert(src.startsWith('data:image/svg+xml,'))
    f.emit('subagent.complete', { status: 'completed', summary: 'Правила проверены.' })
    await f.flush()
    assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity]').length, 2)
    assert.equal(f.document.querySelector('[data-hcv-agent-activity="completed"]').textContent, 'Agent names завершил(-и) работу')

    const remounted = message(f.document, 'assistant-durable', 'Проверка правил продолжается.')
    f.loading.root.remove()
    f.durable.root.replaceWith(remounted.root)
    assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity]').length, 0, 'The fixture must remove the old generated DOM')
    await f.flush()
    const rows = [...remounted.body.querySelectorAll('[data-hcv-agent-activity]')]
    assert.deepEqual(rows.map(row => row.textContent), ['Agent names начал(-и) работу', 'Agent names завершил(-и) работу'])
    for (const row of rows) {
      assert.equal(row.getAttribute('data-hcv-agent-id'), id)
      assert.equal(row.querySelector('img').getAttribute('src'), src)
    }
    assert.equal(remounted.body.firstElementChild.className, 'aui-md')
    assert.equal(remounted.body.firstElementChild.nextElementSibling, rows[0].closest('[data-hcv-agent-rows]'))
    assert.equal(f.roster.get().agents.length, 1)
    assert.equal(f.roster.get().agents[0].displayName, 'Agent names')
    assert.equal(f.roster.get().agents[0].visualSeed, childSession, 'The avatar identity is the child conversation, not the task name or worker ID')
  } finally { f.close() }
})

test('a first progress event adds roster activity without inventing a launch row', async () => {
  const f = fixture()
  try {
    await f.flush()
    f.emit('subagent.progress', { text: 'Читает сохранённые правила.' })
    await f.flush()
    const agents = f.roster.get().agents
    assert.equal(agents.length, 1)
    assert.equal(agents[0].displayName, 'Agent names')
    assert.equal(agents[0].visualSeed, childSession)
    assert.equal(agents[0].status, 'running')
    assert.deepEqual([...agents[0].activity], ['Читает сохранённые правила.'])
    assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity]').length, 0)
    assert.equal(agents[0].startAnchor, null)
  } finally { f.close() }
})

for (const withName of [true, false]) test(`a ${withName ? 'named' : 'legacy unnamed'} receipt with no report retains its native state and opens details through its name`, async () => {
  let nativeButton
  let receipt
  const f = fixture(({ document, response, durable, loading, fibers }) => {
    loading.root.remove()
    const card = document.createElement('div')
    card.dataset.delegateCard = ''
    card.innerHTML = `<div><div data-conversation-scaffold><span></span><button>${goal}</button></div></div>`
    durable.body.append(card)
    fibers.set(card, { toolCallId: 'fixture-delegate', args: { goal, ...(withName ? { task_name: metadata.task_name } : {}) },
      result: { status: 'dispatched', goals: [goal], subagent_ids: [id],
        ...(withName ? { task_names: [metadata.task_name], agent_paths: [metadata.agent_path] } : {}) } })
    fibers.set(card.firstElementChild, { row: { status: 'dispatched', ...(withName ? { sessionId: childSession } : {}) } })
    const system = document.createElement('div')
    system.dataset.slot = 'aui_system-message-root'
    receipt = document.createElement('div')
    receipt.dataset.slot = 'aui_background-result'
    receipt.innerHTML = `<div data-conversation-scaffold><span></span><div><button disabled><span><span class="truncate">Subagent Task Completed: ${goal}</span></span></button></div></div>`
    nativeButton = receipt.querySelector('button')
    fibers.set(receipt, { report: '' })
    system.append(receipt)
    response.append(system)
  })
  try {
    await f.flush()
    const wrapper = receipt.querySelector('div[data-hcv-agent-rows]')
    assert(wrapper)
    assert.equal(nativeButton.disabled, true)
    assert.equal(wrapper.matches('button'), false, 'The whole activity row is not a disclosure button')
    assert.equal(wrapper.hasAttribute('aria-expanded'), false)
    assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity="started"]').length, 0,
      'A saved dispatch and completion do not provide an observed start position')
    const completed = f.document.querySelectorAll('[data-hcv-agent-activity="completed"]')
    assert.equal(completed.length, 1, 'The same saved outcome must not also render a duplicate done row at dispatch')
    assert.equal(completed[0].textContent, `${withName ? 'Agent names' : 'Субагент'} завершил(-и) работу`,
      'Use actual name metadata, or the fallback for old goal-only history, without goal inference')
    assert.equal(completed[0].closest('[data-hcv-agent-rows]'), wrapper)
    let reveals = 0
    f.roster.revealAgentPane = () => reveals++
    const link = completed[0].querySelector('[data-hcv-agent-link]')
    assert(link && !link.disabled, 'The agent conversation is reachable even if there is no native report body')
    link.click()
    assert.equal(f.roster.selection.get().id, id)
    assert.equal(reveals, 1)
    assert.equal(nativeButton.disabled, true, 'Name navigation does not mutate the native receipt')
  } finally { f.close() }
})

for (const status of ['queued', 'dispatched']) test(`a ${status} card remains roster-only until an observed start`, async () => {
  const f = fixture(({ document, durable, fibers }) => {
    const card = document.createElement('div')
    card.dataset.delegateCard = ''
    card.dataset.slot = 'tool-block'
    card.innerHTML = `<div><div data-conversation-scaffold><span></span><button>${goal}</button></div></div>`
    durable.body.append(card)
    fibers.set(card, { toolCallId: 'pending-call', args: { tasks: [{ goal, task_name: metadata.task_name }] },
      result: { status: 'dispatched', goals: [goal], subagent_ids: [id], task_names: [metadata.task_name], agent_paths: [metadata.agent_path] } })
    fibers.set(card.firstElementChild, { row: { status, sessionId: childSession } })
  })
  try {
    await f.flush()
    assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity]').length, 0)
    assert.equal(f.roster.get().agents.length, 1)
    assert.equal(f.roster.get().agents[0].status, status)
    f.emit('subagent.start')
    await f.flush()
    assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity="started"]').length, 1)
    assert.equal(f.roster.get().agents[0].displayName, 'Agent names')
  } finally { f.close() }
})

test('consecutive starts use one sentence and each name opens its own agent', async () => {
  const f = fixture()
  try {
    await f.flush()
    f.emit('subagent.start')
    f.emit('subagent.start', { subagent_id: 'second-agent', child_session_id: 'second-child',
      task_name: 'results_review', agent_path: '/root/results_review', goal: 'Another exact goal.' })
    await f.flush()
    const rows = f.document.querySelectorAll('[data-hcv-agent-activity="started"]')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].textContent, 'Agent names и Results review начал(-и) работу')
    assert.equal(rows[0].querySelectorAll('img').length, 2)
    assert.equal(rows[0].closest('button'), null)
    let reveals = 0
    f.roster.revealAgentPane = () => reveals++
    for (const expected of [id, 'second-agent']) {
      rows[0].querySelector(`[data-hcv-agent-link="${expected}"]`).click()
      assert.equal(f.roster.selection.get().id, expected)
    }
    assert.equal(reveals, 2)
  } finally { f.close() }
})

test('a resumed child replaces its interrupted live state without accepting an old completion', async () => {
  const f = fixture()
  const original = { delegation_id: 'old-delegation' }
  const resumed = { delegation_id: 'hcv-resume-checkpoint-next-run' }
  try {
    await f.flush()
    f.emit('subagent.start', original)
    f.emit('subagent.complete', { ...original, status:'interrupted' })
    await f.flush()
    assert.equal(f.roster.get().agents[0].status,'interrupted')
    f.emit('subagent.start', { ...resumed, child_session_id:'wrong-child' })
    await f.flush()
    assert.equal(f.roster.get().agents[0].status,'interrupted')
    f.emit('subagent.start', resumed)
    await f.flush()
    assert.equal(f.roster.get().agents.length,1)
    assert.equal(f.roster.get().agents[0].status,'running')
    const afterStart = f.roster.get().agents[0]
    assert.equal(afterStart.childSession,childSession)
    assert.equal(afterStart.displayName,'Agent names')
    assert.equal(afterStart.finishedAt,undefined)
    f.emit('subagent.complete', { ...original, status:'failed' })
    await f.flush()
    assert.equal(f.roster.get().agents[0].status,'running')
    f.emit('subagent.complete', { ...resumed, status:'completed' })
    await f.flush()
    assert.equal(f.roster.get().agents[0].status,'completed')
  } finally { f.close() }
})

test('a saved interruption keeps its history while the roster shows a resumed child', async () => {
  const original = { delegation_id: 'old-delegation' }
  const resumed = { delegation_id: 'hcv-resume-checkpoint-next-run' }
  const f = fixture(({ document, response, durable, fibers }) => {
    const card = document.createElement('div')
    card.dataset.delegateCard = ''
    card.innerHTML = '<div><div data-conversation-scaffold><span></span><button>'+goal+'</button></div></div>'
    durable.body.append(card)
    fibers.set(card, { toolCallId: 'saved-call', args: { goal },
      result: { status:'dispatched', delegation_id:original.delegation_id, goals:[goal], subagent_ids:[id] } })
    fibers.set(card.firstElementChild, { row:{ status:'interrupted',sessionId:childSession } })
    const system=document.createElement('div')
    system.dataset.slot='aui_system-message-root'
    system.innerHTML='<div data-slot="aui_background-result"><div data-conversation-scaffold><span></span><div><button disabled><span><span class="truncate">Subagent Task Interrupted: '+goal+'</span></span></button></div></div></div>'
    response.append(system)
  })
  try {
    await f.flush()
    f.emit('subagent.start', original)
    f.emit('subagent.complete', { ...original, status:'interrupted' })
    await f.flush()
    assert.equal(f.roster.get().agents[0].status,'interrupted')
    f.emit('subagent.start', resumed)
    await f.flush()
    assert.equal(f.roster.get().agents.length,1)
    assert.equal(f.roster.get().agents[0].status,'running')
    assert(f.document.querySelector('[data-slot="aui_background-result"] [data-hcv-agent-activity="interrupted"]'))
    f.emit('subagent.complete', { ...resumed, status:'completed' })
    await f.flush()
    assert.equal(f.roster.get().agents[0].status,'completed')
  } finally {f.close()}
})
